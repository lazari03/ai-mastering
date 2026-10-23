from __future__ import annotations

import librosa
import numpy as np
from scipy.signal import fftconvolve

from .audio_utils import EPS, _db


def _collect_true_regions(mask: np.ndarray, min_frames: int) -> list[tuple[int, int]]:
    regions: list[tuple[int, int]] = []
    if mask.size == 0:
        return regions

    start = None
    for idx, flag in enumerate(mask):
        if flag and start is None:
            start = idx
        elif not flag and start is not None:
            if (idx - start) >= min_frames:
                regions.append((start, idx))
            start = None

    if start is not None and (mask.size - start) >= min_frames:
        regions.append((start, mask.size))
    return regions


def _detect_song_sections(audio_stereo: np.ndarray, sr: int) -> dict:
    """
    Heuristic section detection using energy profile to locate chorus/bridge/final chorus.
    """
    mono = np.mean(audio_stereo, axis=1)
    duration_s = float(audio_stereo.shape[0] / max(sr, 1))
    if duration_s < 24.0:
        return {
            "method": "fallback_short",
            "chorus_regions": [],
            "bridge_region": None,
            "final_chorus_region": None,
            "duration_s": round(duration_s, 3),
        }

    frame_length = 4096
    hop_length = 1024
    rms = librosa.feature.rms(y=mono, frame_length=frame_length, hop_length=hop_length)[0]
    if rms.size == 0:
        return {
            "method": "fallback_empty",
            "chorus_regions": [],
            "bridge_region": None,
            "final_chorus_region": None,
            "duration_s": round(duration_s, 3),
        }

    rms_smooth = np.convolve(rms, np.ones(8, dtype=np.float32) / 8.0, mode="same")
    high_threshold = float(np.percentile(rms_smooth, 68))
    low_threshold = float(np.percentile(rms_smooth, 35))

    # Low-variance masters create unstable boundaries; use deterministic fallback in that case.
    MIN_RMS_SPREAD_DB = 1.5
    threshold_spread_db = _db(max(high_threshold, EPS)) - _db(max(low_threshold, EPS))
    insufficient_spread = threshold_spread_db < MIN_RMS_SPREAD_DB

    min_section_s = 8.0
    min_frames = max(4, int(min_section_s * sr / hop_length))

    if insufficient_spread:
        high_regions = []
        low_regions = []
    else:
        high_regions = _collect_true_regions(rms_smooth >= high_threshold, min_frames=min_frames)
        low_regions = _collect_true_regions(rms_smooth <= low_threshold, min_frames=max(3, min_frames // 2))

    times = librosa.frames_to_time(np.arange(rms_smooth.size), sr=sr, hop_length=hop_length)

    chorus_regions: list[tuple[float, float]] = []
    for start_f, end_f in high_regions:
        start_t = float(times[min(start_f, times.size - 1)])
        end_t = float(times[min(max(end_f - 1, start_f), times.size - 1)])
        if (end_t - start_t) >= min_section_s:
            chorus_regions.append((start_t, end_t))

    if len(chorus_regions) > 3:
        scored = []
        for s, e in chorus_regions:
            i0 = int(max(0, np.floor(s * sr / hop_length)))
            i1 = int(min(rms_smooth.size, np.ceil(e * sr / hop_length)))
            scored.append((float(np.mean(rms_smooth[i0:i1])), (s, e)))
        scored.sort(key=lambda x: x[0], reverse=True)
        chorus_regions = [region for _, region in scored[:3]]
        chorus_regions.sort(key=lambda x: x[0])

    final_chorus_region = chorus_regions[-1] if chorus_regions else None

    bridge_region = None
    if final_chorus_region is not None:
        bridge_candidates: list[tuple[float, tuple[float, float]]] = []
        for start_f, end_f in low_regions:
            start_t = float(times[min(start_f, times.size - 1)])
            end_t = float(times[min(max(end_f - 1, start_f), times.size - 1)])
            if (end_t - start_t) < 6.0:
                continue
            if start_t < duration_s * 0.35 or start_t > duration_s * 0.88:
                continue
            if final_chorus_region and start_t >= final_chorus_region[0]:
                continue
            i0 = int(max(0, np.floor(start_t * sr / hop_length)))
            i1 = int(min(rms_smooth.size, np.ceil(end_t * sr / hop_length)))
            bridge_candidates.append((float(np.mean(rms_smooth[i0:i1])), (start_t, end_t)))

        if bridge_candidates:
            bridge_candidates.sort(key=lambda x: x[0])
            bridge_region = bridge_candidates[0][1]

    if not chorus_regions:
        # Deterministic musical fallback when energy segmentation fails.
        chorus_regions = [
            (duration_s * 0.30, duration_s * 0.46),
            (duration_s * 0.76, duration_s * 0.94),
        ]
        final_chorus_region = chorus_regions[-1]
        bridge_region = (duration_s * 0.56, duration_s * 0.68)
        method = "fallback_structure"
    else:
        method = "energy_profile"

    return {
        "method": method,
        "chorus_regions": [(round(s, 3), round(e, 3)) for s, e in chorus_regions],
        "bridge_region": (round(bridge_region[0], 3), round(bridge_region[1], 3)) if bridge_region else None,
        "final_chorus_region": (round(final_chorus_region[0], 3), round(final_chorus_region[1], 3)) if final_chorus_region else None,
        "duration_s": round(duration_s, 3),
    }


def _section_gain_db_envelope(total_samples: int, sr: int, section_info: dict, gains_db: dict, ramp_s: float = 0.75) -> np.ndarray:
    env_db = np.zeros(total_samples, dtype=np.float32)

    def apply_region(start_s: float, end_s: float, gain_db: float) -> None:
        if end_s <= start_s:
            return
        start_i = int(np.clip(start_s * sr, 0, total_samples - 1))
        end_i = int(np.clip(end_s * sr, 0, total_samples))
        if end_i <= start_i:
            return
        env_db[start_i:end_i] = np.maximum(env_db[start_i:end_i], gain_db)

    for start_s, end_s in section_info.get("chorus_regions", []):
        apply_region(float(start_s), float(end_s), float(gains_db.get("chorus", 0.0)))

    bridge = section_info.get("bridge_region")
    if bridge:
        apply_region(float(bridge[0]), float(bridge[1]), float(gains_db.get("bridge", 0.0)))

    final_chorus = section_info.get("final_chorus_region")
    if final_chorus:
        apply_region(float(final_chorus[0]), float(final_chorus[1]), float(gains_db.get("final_chorus", gains_db.get("chorus", 0.0))))

    ramp = max(8, int(sr * ramp_s))
    kernel = np.hanning(ramp * 2 + 1).astype(np.float32)
    kernel /= max(float(np.sum(kernel)), EPS)
    # np.convolve is direct O(N*M) — with a ~1.5s-wide kernel against a whole
    # track that's ~140s of the ~170s this function used to cost. Same result
    # via FFT (O(N log N)); verified numerically equivalent (diff ~1e-6).
    smooth = fftconvolve(env_db, kernel, mode="same")
    return smooth.astype(np.float32)


def _db_to_lin(db_values: np.ndarray) -> np.ndarray:
    return np.power(10.0, db_values / 20.0).astype(np.float32)
