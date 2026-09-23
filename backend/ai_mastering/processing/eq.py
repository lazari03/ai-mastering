"""Static EQ used by BOTH the planner (to predict each band's change before
rendering) and the renderer (to apply it). One implementation means the
plan's "expected change" is exactly what the EQ stage does — any deviation
the evaluator measures comes from other stages, not from a mismatch
between a predicted curve and a different filter implementation.

Filters are RBJ Audio-EQ-Cookbook biquads applied with scipy's sosfilt
(vectorised C, minimum phase like a conventional mastering EQ).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import sosfilt, sosfreqz


def _biquad(filter_type: str, freq_hz: float, gain_db: float, q: float, sr: int) -> np.ndarray:
    freq_hz = float(np.clip(freq_hz, 10.0, sr * 0.45))
    a = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * np.pi * freq_hz / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * max(q, 0.05))
    if filter_type == "bell":
        b = [1 + alpha * a, -2 * cw, 1 - alpha * a]
        den = [1 + alpha / a, -2 * cw, 1 - alpha / a]
    elif filter_type == "low_shelf":
        sa = 2 * np.sqrt(a) * alpha
        b = [a * ((a + 1) - (a - 1) * cw + sa), 2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) - (a - 1) * cw - sa)]
        den = [(a + 1) + (a - 1) * cw + sa, -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sa]
    elif filter_type == "high_shelf":
        sa = 2 * np.sqrt(a) * alpha
        b = [a * ((a + 1) + (a - 1) * cw + sa), -2 * a * ((a - 1) + (a + 1) * cw), a * ((a + 1) + (a - 1) * cw - sa)]
        den = [(a + 1) - (a - 1) * cw + sa, 2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - sa]
    else:
        raise ValueError(f"Unknown filter type: {filter_type}")
    b = np.asarray(b) / den[0]
    den = np.asarray(den) / den[0]
    return np.concatenate([b, den])[np.newaxis, :]


def decisions_to_sos(decisions, sr: int) -> np.ndarray | None:
    rows = [
        _biquad(d.filter_type, d.frequency_hz, d.gain_db, d.q, sr)
        for d in decisions
        if abs(float(d.gain_db)) > 1e-3
    ]
    return np.vstack(rows) if rows else None


def response_db_at(decisions, freqs_hz: np.ndarray, sr: int) -> np.ndarray:
    sos = decisions_to_sos(decisions, sr)
    freqs_hz = np.asarray(freqs_hz, dtype=np.float64)
    if sos is None:
        return np.zeros_like(freqs_hz)
    _, h = sosfreqz(sos, worN=np.clip(freqs_hz, 1.0, sr * 0.499), fs=sr)
    return 20.0 * np.log10(np.abs(h) + 1e-12)


def band_response_db(decisions, band_layout: list[dict], sr: int, points_per_band: int = 9) -> dict[str, float]:
    """Power-averaged response over each band (log-spaced sample points),
    i.e. the change in that band's energy for a spectrally flat input —
    the same quantity the evaluator measures on the rendered audio."""
    out = {}
    for b in band_layout:
        pts = np.geomspace(max(b["lo_hz"], 1.0), max(b["hi_hz"], b["lo_hz"] + 1.0), points_per_band)
        r = response_db_at(decisions, pts, sr)
        out[b["name"]] = float(10.0 * np.log10(np.mean(10.0 ** (r / 10.0))))
    return out


def apply_eq(audio: np.ndarray, decisions, sr: int) -> np.ndarray:
    sos = decisions_to_sos(decisions, sr)
    if sos is None:
        return audio
    return sosfilt(sos, audio, axis=0).astype(np.float32)


def apply_eq_mono(signal: np.ndarray, decisions, sr: int) -> np.ndarray:
    sos = decisions_to_sos(decisions, sr)
    if sos is None:
        return signal
    return sosfilt(sos, signal).astype(np.float32)


def q_for_bandwidth(bandwidth_oct: float) -> float:
    """Bell Q whose -3 dB bandwidth is `bandwidth_oct` octaves."""
    n = 2.0 ** max(bandwidth_oct, 0.1)
    return float(np.sqrt(n) / (n - 1.0))
