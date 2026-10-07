from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from pedalboard import Compressor, HighShelfFilter, PeakFilter, Pedalboard

from .audio_utils import EPS, MASTER_SR, _db, _load_audio, _rms
from .mastering_params import _sanitize_tweaks

DEMUCS_CACHE_DIR = Path.home() / ".cache" / "demucs"
DEMUCS_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _is_stem_separation_requested(tags: list[str], tweaks: dict | None, analysis: dict, enable_stem_separation: bool = False) -> bool:
    if not enable_stem_separation:
        return False
    sanitized = _sanitize_tweaks(tweaks)
    return (
        "better_vocals" in tags
        or abs(sanitized.get("presence", 0.0)) >= 0.2
    )


def _fit_length(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[0] >= n:
        return x[:n]
    return np.pad(x, ((0, n - x.shape[0]), (0, 0)))


def _load_stems(vocal_path: str | Path, music_path: str | Path, sr: int, n_samples: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Load Demucs stems AT THE PIPELINE'S RATE. Demucs writes at its model
    rate (44.1 kHz); a 48/88.2/96 kHz job must resample them, or every
    filter frequency, section time and the summed pre-master itself would
    be wrong by the rate ratio (a 44.1 kHz stem played as 48 kHz is ~8.8%
    fast and sharp). Trimmed/padded to the source length so the stems line
    up sample-for-sample with the mix they came from."""
    vocals, sr_v = _load_audio(vocal_path, sr=sr)
    accompaniment, sr_m = _load_audio(music_path, sr=sr)
    if sr_v != sr or sr_m != sr:
        raise RuntimeError(f"stems loaded at {sr_v}/{sr_m} Hz, pipeline runs at {sr} Hz")
    if n_samples is not None:
        vocals, accompaniment = _fit_length(vocals, n_samples), _fit_length(accompaniment, n_samples)
    return vocals, accompaniment


def _separate_vocal_stems(input_path: str | Path, max_threads: int | None = None, sr: int = MASTER_SR, n_samples: int | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
    with tempfile.TemporaryDirectory(prefix="ai_mastering_demucs_") as temp_dir:
        model_candidates = ["htdemucs_ft", "htdemucs"]
        failure_text = "demucs separation failed"
        chosen_model = None
        vocal_path = None
        music_path = None

        env = os.environ.copy()
        env["TMPDIR"] = temp_dir
        env["DEMUCS_CACHE"] = str(DEMUCS_CACHE_DIR)
        if max_threads is not None:
            env["OMP_NUM_THREADS"] = str(max_threads)
            env["MKL_NUM_THREADS"] = str(max_threads)

        for model_name in model_candidates:
            cmd = [
                sys.executable,
                "-m",
                "demucs.separate",
                "-n",
                model_name,
                "--two-stems",
                "vocals",
                "-d",
                "cpu",
                "-o",
                temp_dir,
                str(input_path),
            ]

            result = None
            for _ in range(2):
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, env=env)
                if result.returncode == 0:
                    break
                failure_text = result.stderr[-2500:] or result.stdout[-2500:] or failure_text

            if result is None or result.returncode != 0:
                continue

            track_dir = Path(temp_dir) / model_name / Path(input_path).stem
            test_vocal = track_dir / "vocals.wav"
            test_music = track_dir / "no_vocals.wav"
            if test_vocal.exists() and test_music.exists():
                chosen_model = model_name
                vocal_path = test_vocal
                music_path = test_music
                break

        if vocal_path is None or music_path is None:
            raise RuntimeError(failure_text)

        vocals, accompaniment = _load_stems(vocal_path, music_path, sr, n_samples)

        metadata = {
            "status": "applied",
            "engine": f"demucs_{chosen_model or 'unknown'}",
            "sample_rate": int(sr),
            "vocal_path": str(vocal_path),
            "music_path": str(music_path),
        }
        return vocals, accompaniment, metadata


def _apply_board(stereo: np.ndarray, sr: int, board: Pedalboard) -> np.ndarray:
    # Same chain on both channels (stereo is kept: the vocal stem carries
    # the mix's own vocal ambience and width).
    return np.asarray(board(np.ascontiguousarray(stereo.T, dtype=np.float32), sr).T, dtype=np.float32)


def _process_vocal_stem(vocals: np.ndarray, sr: int, moves: dict) -> tuple[np.ndarray, dict]:
    """Apply ONLY the measured vocal moves from stem_decisions.plan_stem_moves.
    With no moves the stem is returned untouched, so vocals + accompaniment
    recombine to the original mix."""
    vocals = np.asarray(vocals, dtype=np.float32)
    plugins = []
    ratio = float(moves.get("vocal_compression_ratio", 1.0))
    if ratio > 1.01:
        thr = float(_db(_rms(vocals)) + 6.0)
        plugins.append(Compressor(threshold_db=thr, ratio=ratio, attack_ms=18.0, release_ms=130.0))
    for freq, key, q in ((320.0, "vocal_low_mid_cut_db", 0.9), (2900.0, "vocal_presence_gain_db", 1.0), (3600.0, "vocal_harsh_cut_db", 1.25)):
        g = float(moves.get(key, 0.0))
        if abs(g) > 0.05:
            plugins.append(PeakFilter(cutoff_frequency_hz=freq, gain_db=g, q=q))
    for freq, key in ((6500.0, "vocal_deess_shelf_db"), (12000.0, "vocal_air_gain_db")):
        g = float(moves.get(key, 0.0))
        if abs(g) > 0.05:
            plugins.append(HighShelfFilter(cutoff_frequency_hz=freq, gain_db=g, q=0.8))
    if not plugins:
        return vocals, {"applied": [], "unchanged": True}
    processed = _apply_board(vocals, sr, Pedalboard(plugins))
    if ratio > 1.01:
        # Level-match the levelled vocal back to its own RMS so compression
        # changes dynamics, not the vocal-to-accompaniment balance.
        processed *= float(_rms(vocals) / max(_rms(processed), EPS))
    return processed.astype(np.float32), {"applied": [type(p).__name__ for p in plugins], "unchanged": False}


def _process_accompaniment_stem(accompaniment: np.ndarray, sr: int, moves: dict) -> tuple[np.ndarray, dict]:
    accompaniment = np.asarray(accompaniment, dtype=np.float32)
    cut = float(moves.get("accompaniment_presence_cut_db", 0.0))
    if abs(cut) <= 0.05:
        return accompaniment, {"vocal_space_cut_db": 0.0, "unchanged": True}
    processed = _apply_board(accompaniment, sr, Pedalboard([PeakFilter(cutoff_frequency_hz=2600.0, gain_db=cut, q=0.95)]))
    return processed, {"vocal_space_cut_db": round(cut, 3), "unchanged": False}
