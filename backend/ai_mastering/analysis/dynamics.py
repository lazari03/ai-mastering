"""Small, vectorised dynamics measurements used by the SourceProfile and the
render stage (limiter budget). Everything here is O(n) NumPy — no per-sample
Python loops."""

from __future__ import annotations

import numpy as np

EPS = 1e-12

# 10 ms blocks: short enough to resolve individual drum hits, long enough
# that the percentile is not dominated by single-sample inter-sample spikes.
PEAK_BLOCK_S = 0.01
# 99.5th percentile of block peaks = the level of "the loud hits", not the
# one isolated spike a limiter can remove inaudibly.
PEAK_PERCENTILE = 99.5
# A full-scale run shorter than this is an ordinary peak that touched 0 dBFS;
# 3+ consecutive samples pinned at full scale is the signature of clipping.
CLIP_THRESHOLD = 0.9999
CLIP_MIN_RUN = 3


def block_peaks_db(audio_stereo: np.ndarray, sr: int, block_s: float = PEAK_BLOCK_S) -> np.ndarray:
    audio = np.asarray(audio_stereo, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[:, np.newaxis]
    block = max(1, int(sr * block_s))
    n = audio.shape[0] // block
    if n < 1:
        return np.array([20.0 * np.log10(float(np.max(np.abs(audio))) + EPS)])
    peaks = np.max(np.abs(audio[: n * block]).reshape(n, block, audio.shape[1]), axis=(1, 2))
    return 20.0 * np.log10(peaks + EPS)


def peak_percentile_db(audio_stereo: np.ndarray, sr: int, percentile: float = PEAK_PERCENTILE) -> float:
    peaks = block_peaks_db(audio_stereo, sr)
    # Ignore near-silent blocks so fades/intros do not dilute the statistic.
    active = peaks[peaks > (float(peaks.max()) - 40.0)]
    return float(np.percentile(active if active.size else peaks, percentile))


def clipping_evidence(audio_stereo: np.ndarray) -> dict:
    audio = np.asarray(audio_stereo, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[:, np.newaxis]
    pinned = np.abs(audio) >= CLIP_THRESHOLD
    fraction = float(pinned.mean())
    longest = 0
    runs_over_min = 0
    for ch in range(pinned.shape[1]):
        col = pinned[:, ch].astype(np.int8)
        if not col.any():
            continue
        diff = np.diff(np.concatenate(([0], col, [0])))
        starts = np.where(diff == 1)[0]
        ends = np.where(diff == -1)[0]
        lengths = ends - starts
        longest = max(longest, int(lengths.max()))
        runs_over_min += int(np.sum(lengths >= CLIP_MIN_RUN))
    return {
        "clipped_sample_fraction": round(fraction, 7),
        "longest_clipped_run": longest,
        "clipped_runs": runs_over_min,
        "detected": bool(runs_over_min > 0),
    }


def bpm_confidence(beat_times_s: np.ndarray) -> float:
    """Regularity of detected beats: coefficient of variation of the inter-
    beat intervals mapped to 0..1 (CV 0 -> 1.0, CV >= 0.15 -> 0.0). Fewer
    than 8 beats cannot establish a tempo."""
    beats = np.asarray(beat_times_s, dtype=np.float64)
    if beats.size < 8:
        return 0.0
    intervals = np.diff(beats)
    intervals = intervals[intervals > 0]
    if intervals.size < 7:
        return 0.0
    cv = float(np.std(intervals) / (np.mean(intervals) + EPS))
    return float(np.clip(1.0 - cv / 0.15, 0.0, 1.0))
