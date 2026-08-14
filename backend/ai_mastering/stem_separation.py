from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from pedalboard import Compressor, HighShelfFilter, NoiseGate, PeakFilter, Pedalboard

from .audio_utils import EPS, MASTER_SR, _analysis_from_audio, _db, _load_audio, _rms, _smooth_envelope
from .dsp_filters import _lr4_highpass, _to_pedalboard_shape
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


def _separate_vocal_stems(input_path: str | Path, max_threads: int | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
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

        vocals, sr_v = _load_audio(vocal_path, sr=MASTER_SR)
        accompaniment, sr_m = _load_audio(music_path, sr=MASTER_SR)
        if sr_v != MASTER_SR or sr_m != MASTER_SR:
            raise RuntimeError("Unexpected stem sample rate")

        metadata = {
            "status": "applied",
            "engine": f"demucs_{chosen_model or 'unknown'}",
            "vocal_path": str(vocal_path),
            "music_path": str(music_path),
        }
        return vocals, accompaniment, metadata


def _process_vocal_stem(vocals: np.ndarray, sr: int, params: dict) -> tuple[np.ndarray, dict]:
    vocal_analysis = _analysis_from_audio(vocals, sr)
    mono = np.mean(vocals, axis=1)
    mono = _lr4_highpass(mono, 90.0, sr)

    # Vocal rider-style automation to keep vocal integrated before compression.
    env = _smooth_envelope(mono, sr, window_ms=75.0)
    env_ref = float(np.percentile(env, 65))
    rider_db = np.clip((env_ref - env) / max(env_ref, EPS) * 3.0, -1.2, 1.2)
    rider_lin = np.power(10.0, rider_db / 20.0).astype(np.float32)
    mono = (mono * rider_lin).astype(np.float32)

    rms_db = _db(_rms(mono))
    gate_threshold = float(np.clip(rms_db - 18.0, -45.0, -24.0))
    deesser_gain = float(np.clip(-1.0 - (params.get("deesser_strength", 0.0) * 2.0), -4.0, -0.8))
    presence_gain = float(np.clip(params.get("vocal_presence_gain_db", 0.0), -0.8, 1.1))
    harsh_cut = -1.4 if vocal_analysis["spectral_balance"]["high_mid_2000_4000hz"] > 0.18 else -0.6
    air_gain = float(np.clip(0.35 + (presence_gain * 0.15), 0.2, 0.8))

    vocal_board = Pedalboard(
        [
            NoiseGate(threshold_db=gate_threshold, ratio=1.8, attack_ms=5.0, release_ms=120.0),
            Compressor(threshold_db=-20.0, ratio=1.9, attack_ms=18.0, release_ms=130.0),
            PeakFilter(cutoff_frequency_hz=320.0, gain_db=-0.8, q=0.9),
            PeakFilter(cutoff_frequency_hz=2900.0, gain_db=presence_gain, q=1.0),
            PeakFilter(cutoff_frequency_hz=3600.0, gain_db=harsh_cut, q=1.25),
            HighShelfFilter(cutoff_frequency_hz=6500.0, gain_db=deesser_gain, q=0.8),
            HighShelfFilter(cutoff_frequency_hz=12000.0, gain_db=air_gain, q=0.7),
        ]
    )
    compressed_mono = np.asarray(vocal_board(_to_pedalboard_shape(mono), sr)[0], dtype=np.float32)

    # Parallel vocal compression for density without flattening transients.
    parallel_board = Pedalboard([
        Compressor(threshold_db=-30.0, ratio=3.6, attack_ms=6.0, release_ms=100.0),
    ])
    parallel_mono = np.asarray(parallel_board(_to_pedalboard_shape(mono), sr)[0], dtype=np.float32)
    processed_mono = (compressed_mono * 0.76) + (parallel_mono * 0.24)

    dry_mix = 0.2
    processed_mono = (processed_mono * (1.0 - dry_mix)) + (mono * dry_mix)
    processed_vocals = np.stack([processed_mono, processed_mono], axis=1)
    processed_vocals *= float(np.clip(1.0 + (params.get("vocal_presence_gain_db", 0.0) * 0.06), 0.92, 1.08))

    return processed_vocals.astype(np.float32), {
        "gate_threshold_db": round(gate_threshold, 3),
        "presence_gain_db": round(presence_gain, 3),
        "deesser_gain_db": round(deesser_gain, 3),
        "harsh_cut_db": round(harsh_cut, 3),
        "air_gain_db": round(air_gain, 3),
    }


def _process_accompaniment_stem(accompaniment: np.ndarray, sr: int, params: dict) -> tuple[np.ndarray, dict]:
    mono = np.mean(accompaniment, axis=1)
    vocal_space_cut = float(np.clip(-0.6 - (params.get("vocal_presence_gain_db", 0.0) * 0.25), -1.2, -0.2))
    mud_cut = float(np.clip(-0.3 - max(0.0, params["per_band_gain_changes_db"].get("low_mid_250_500hz", 0.0)) * 0.15, -1.0, 0.0))

    stem_board = Pedalboard(
        [
            PeakFilter(cutoff_frequency_hz=320.0, gain_db=mud_cut, q=0.9),
            PeakFilter(cutoff_frequency_hz=2600.0, gain_db=vocal_space_cut, q=0.95),
        ]
    )

    left = np.asarray(stem_board(_to_pedalboard_shape(accompaniment[:, 0]), sr)[0], dtype=np.float32)
    right = np.asarray(stem_board(_to_pedalboard_shape(accompaniment[:, 1]), sr)[0], dtype=np.float32)
    return np.stack([left, right], axis=1), {
        "vocal_space_cut_db": round(vocal_space_cut, 3),
        "mud_cut_db": round(mud_cut, 3),
    }
