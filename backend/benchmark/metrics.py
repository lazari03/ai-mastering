"""Master-vs-source measurements for the listening benchmark and the
regression suite. Every comparison is at MATCHED LOUDNESS (the candidate
is gain-matched to the source first) — otherwise "louder" reads as
"better" and every band looks boosted.

The four failure modes this exists to catch, from real listening:
  lost_drums   — punch (onset strength over the bed) drops
  weaker_bass  — a musical low band loses level relative to the rest
  harsh_highs  — the upper bands rise relative to the rest
  pumping      — the highs dip each time the kick hits (the bus is being
                 ducked by low-end energy: limiter/compressor pumping)
Limits come from ai_mastering/output_validation.GuardrailConfig so the
benchmark and the engine's own guardrails agree on what "damage" means.
"""

from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
from scipy.signal import butter, sosfiltfilt

from ai_mastering.audio_utils import _transient_metrics, _true_peak_db
from ai_mastering.band_levels import loudness_matched_band_deltas
from ai_mastering.output_validation import HIGH_BANDS, LOW_END_MUSICAL_BANDS, GuardrailConfig

LIMITS = GuardrailConfig()
# HF dip (dB) on kick frames vs. the rest, beyond which a master pumps.
PUMPING_LIMIT_DB = -1.0
# Below this drum-punch score a track has no drums worth judging.
MIN_PUNCH_TO_JUDGE = 0.15


def _stereo(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    return np.stack([x, x], axis=1) if x.ndim == 1 else x[:, :2]


def _lufs(x: np.ndarray, sr: int) -> float:
    return float(pyln.Meter(sr).integrated_loudness(x))


def _band_env_db(mono: np.ndarray, sr: int, lo: float, hi: float, frame_s: float = 0.01) -> np.ndarray:
    sos = butter(4, [lo, min(hi, sr / 2 - 100)], btype="band", fs=sr, output="sos")
    band = sosfiltfilt(sos, mono)
    win = max(1, int(sr * frame_s))
    n = band.shape[0] // win
    frames = band[: n * win].reshape(n, win)
    return 20.0 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-9)


def pumping_db(source: np.ndarray, matched: np.ndarray, sr: int) -> float:
    """How much the 2-8 kHz band of the (loudness-matched) master dips,
    relative to the source, on the loudest kick frames compared with the
    quiet-low-end frames. ~0 = no pumping; negative = ducking in dB."""
    src_mono = source.mean(axis=1)
    out_mono = matched.mean(axis=1)
    low = _band_env_db(src_mono, sr, 40.0, 120.0)
    hf_src = _band_env_db(src_mono, sr, 2000.0, 8000.0)
    hf_out = _band_env_db(out_mono, sr, 2000.0, 8000.0)
    n = min(len(low), len(hf_src), len(hf_out))
    low, hf_src, hf_out = low[:n], hf_src[:n], hf_out[:n]
    audible = hf_src > np.max(hf_src) - 50.0
    if np.count_nonzero(audible) < 50:
        return 0.0
    change = (hf_out - hf_src)[audible]
    low = low[audible]
    kick = low >= np.percentile(low, 90)
    calm = low <= np.percentile(low, 50)
    if not np.any(kick) or not np.any(calm):
        return 0.0
    return round(float(np.median(change[kick]) - np.median(change[calm])), 2)


def compare(source: np.ndarray, candidate: np.ndarray, sr: int) -> dict:
    source, candidate = _stereo(source), _stereo(candidate)
    n = min(len(source), len(candidate))
    source, candidate = source[:n], candidate[:n]
    lufs_src, lufs_out = _lufs(source, sr), _lufs(candidate, sr)
    gain_db = float(np.clip(lufs_src - lufs_out, -24.0, 24.0))
    matched = candidate * (10.0 ** (gain_db / 20.0))

    bands = loudness_matched_band_deltas(source, candidate, sr, lufs_src, lufs_out)
    low_change = min(bands[b] for b in LOW_END_MUSICAL_BANDS)
    high_change = max(bands[b] for b in HIGH_BANDS)
    punch_src = float(_transient_metrics(source, sr).get("drum_punch_estimate", 0.0))
    punch_out = float(_transient_metrics(matched, sr).get("drum_punch_estimate", 0.0))
    punch_loss = (punch_src - punch_out) / punch_src if punch_src >= MIN_PUNCH_TO_JUDGE else 0.0
    pump = pumping_db(source, matched, sr)
    tp = float(_true_peak_db(candidate))

    failures = []
    if punch_loss > LIMITS.max_transient_loss:
        failures.append({"kind": "lost_drums", "measured": round(punch_loss, 3), "limit": LIMITS.max_transient_loss, "detail": f"drum punch {punch_src:.3f} -> {punch_out:.3f} at matched loudness"})
    if low_change < -LIMITS.max_low_end_loss_db:
        failures.append({"kind": "weaker_bass", "measured": round(low_change, 2), "limit": -LIMITS.max_low_end_loss_db, "detail": "a musical low band lost level relative to the mix"})
    if high_change > LIMITS.max_high_boost_db:
        failures.append({"kind": "harsh_highs", "measured": round(high_change, 2), "limit": LIMITS.max_high_boost_db, "detail": "upper bands rose relative to the mix"})
    if pump < PUMPING_LIMIT_DB:
        failures.append({"kind": "pumping", "measured": pump, "limit": PUMPING_LIMIT_DB, "detail": "highs dip when the kick hits"})

    return {
        "lufs": round(lufs_out, 2),
        "true_peak_dbtp": round(tp, 2),
        "plr_db": round(tp - lufs_out, 2),
        "loudness_change_lu": round(lufs_out - lufs_src, 2),
        "band_deltas_db": bands,
        "low_end_change_db": round(low_change, 2),
        "high_change_db": round(high_change, 2),
        "punch_source": round(punch_src, 3),
        "punch_master": round(punch_out, 3),
        "punch_loss": round(punch_loss, 3),
        "pumping_db": pump,
        "failures": failures,
        "passed": not failures,
    }
