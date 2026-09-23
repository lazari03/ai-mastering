from __future__ import annotations

import numpy as np
from pedalboard import Distortion, Pedalboard
from scipy.signal import butter, lfilter, resample_poly, sosfilt, sosfiltfilt

def _safe_filter(signal: np.ndarray, sos: np.ndarray) -> np.ndarray:
    if signal.shape[0] < 64:
        return sosfilt(sos, signal)
    try:
        return sosfiltfilt(sos, signal)
    except ValueError:
        return sosfilt(sos, signal)


def _lr4_lowpass(signal: np.ndarray, cutoff_hz: float, sr: int) -> np.ndarray:
    nyq = sr * 0.5
    cutoff = min(max(cutoff_hz / nyq, 0.0005), 0.999)
    sos = butter(2, cutoff, btype="low", output="sos")
    first = _safe_filter(signal, sos)
    return _safe_filter(first, sos)


def _lr4_highpass(signal: np.ndarray, cutoff_hz: float, sr: int) -> np.ndarray:
    nyq = sr * 0.5
    cutoff = min(max(cutoff_hz / nyq, 0.0005), 0.999)
    sos = butter(2, cutoff, btype="high", output="sos")
    first = _safe_filter(signal, sos)
    return _safe_filter(first, sos)


def _complementary_split(signal: np.ndarray, sr: int, crossovers_hz: tuple[float, ...], names: tuple[str, ...]) -> dict:
    """Perfect-reconstruction band split: each band is the zero-phase
    low-pass of what remains, and the remainder is `rest - band`, so the
    bands always sum back to the input exactly.

    The previous split high-passed and low-passed independently with a
    doubly-applied zero-phase Butterworth-2 on each side of a crossover;
    the pair sums to |B|^4 + |1-B|^4, which is 0.5 (-6 dB) AT the crossover
    and measured -4..-6 dB over roughly an octave around every crossover
    (e.g. -5.5 dB across 70-120 Hz on the pro tier), even with every band
    compressor idle."""
    bands = {}
    rest = np.asarray(signal)
    for name, fc in zip(names[:-1], crossovers_hz):
        low = _lr4_lowpass(rest, fc, sr)
        bands[name] = low
        rest = rest - low
    bands[names[-1]] = rest
    return bands


def _split_bands(signal: np.ndarray, sr: int) -> dict:
    return _complementary_split(signal, sr, (250.0, 2000.0, 6000.0), ("low", "low_mid", "high_mid", "high"))


def _split_bands_pro(signal: np.ndarray, sr: int) -> dict:
    # Professional tier only: splits the 20-250Hz "low" band into sub
    # (20-90Hz, true sub-bass — slow-moving, no fast transients to
    # preserve) and punch (90-250Hz — kick/bass-note fundamentals, where
    # fast attack actually matters).
    return _complementary_split(signal, sr, (90.0, 250.0, 2000.0, 6000.0), ("sub", "punch", "low_mid", "high_mid", "high"))


def _oversampled_distortion(signal: np.ndarray, sr: int, drive_db: float, oversample: int = 4) -> np.ndarray:
    # A waveshaper generates harmonics above the input's Nyquist frequency;
    # run it at oversample x the rate so those harmonics have room to exist
    # instead of folding back down into the audible range as aliasing. Same
    # resample_poly-up / process / resample_poly-down shape used everywhere
    # else nonlinear processing happens in this codebase (true-peak
    # measurement, the pro limiter, the soft clipper).
    if drive_db <= 0.01:
        return signal
    up = resample_poly(signal, oversample, 1)
    board = Pedalboard([Distortion(drive_db=float(drive_db))])
    driven = np.asarray(board(_to_pedalboard_shape(up), sr * oversample)[0], dtype=np.float32)
    down = resample_poly(driven, 1, oversample)[: signal.shape[0]]
    return down.astype(np.float32)


def _bandpass(signal: np.ndarray, sr: int, center_hz: float, q: float) -> np.ndarray:
    bandwidth = max(center_hz / max(q, 0.1), 10.0)
    low = max(20.0, center_hz - bandwidth / 2)
    high = min(sr / 2 - 100.0, center_hz + bandwidth / 2)
    if high <= low:
        high = low + 10.0
    sos = butter(2, [low, high], btype="band", fs=sr, output="sos")
    return sosfiltfilt(sos, signal)


def _envelope_db(signal: np.ndarray, sr: int, release_ms: float) -> np.ndarray:
    # One-pole follower on the release time constant (same approximation as
    # preset_dsp_engine.py's dynamic EQ — attack folded in, fast enough on
    # long tracks, close enough for "which parts of this narrow band are hot").
    alpha = float(np.exp(-1.0 / (sr * max(release_ms, 1.0) / 1000.0)))
    env = lfilter([1 - alpha], [1, -alpha], np.abs(signal))
    return 20 * np.log10(env + 1e-9)


def _dynamic_eq_narrowband(
    signal: np.ndarray, sr: int, center_hz: float, q: float, max_reduction_db: float, release_ms: float, threshold_percentile: float = 75.0
) -> np.ndarray:
    """Narrow-band, level-dependent gain reduction at one center frequency —
    only engages on the hottest activity above `threshold_percentile`,
    capped at max_reduction_db, leaving quieter passages untouched.
    Complements static EQ, doesn't replace it: static EQ makes a fixed
    correction; this only reacts.

    Used by the de-esser below and preset_dsp_engine.py's dynamic EQ. The
    adaptive engine's own dynamic EQ (processing/render.py) uses the same
    bandpass/envelope helpers, M/S-linked, with centres taken from measured
    problem regions/resonances instead of fixed per-band constants.
    """
    if max_reduction_db <= 0:
        return signal
    narrow = _bandpass(signal, sr, center_hz, q)
    env_db = _envelope_db(narrow, sr, release_ms)
    threshold_db = float(np.percentile(env_db, threshold_percentile))
    reduction_db = np.clip(env_db - threshold_db, 0.0, max_reduction_db)
    gain = 10.0 ** (-reduction_db / 20.0)
    return signal - narrow + narrow * gain


def _to_pedalboard_shape(signal: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(signal[np.newaxis, :], dtype=np.float32)


def _deess(signal: np.ndarray, sr: int, strength: float, center_hz: float = 6500.0, q: float = 2.4, release_ms: float = 70.0) -> np.ndarray:
    """Frequency-selective dynamic gain reduction on the sibilance range
    (~5-8kHz at the default center_hz/q) — the mastering-stage version of
    a de-esser, reusing _dynamic_eq_narrowband's own bandpass-isolate /
    envelope-follow / recombine mechanism rather than a second
    implementation. With no isolated vocal to sidechain from (that's what
    stem separation's own, separate de-esser is for — see
    stem_separation.py), this reacts to whatever energy actually lands in
    the sibilance range across the whole mix, the same way a mastering-
    stage de-esser (Weiss, FabFilter Pro-DS in wideband mode, etc.) has to
    work without a vocal stem to key off.

    strength (0..1, see compute_processing_params's adaptive
    deesser_strength) scales both how hard it reduces and how readily it
    engages — a genuinely sibilant source gets caught, a track that's
    nowhere near the threshold is left untouched (strength <= 0.02 is a
    no-op, not a wasted filter pass on an already-clean source). q=2.4
    keeps this narrow enough to leave presence (~3kHz) and true air/
    cymbals (~10kHz+) alone. center_hz comes from the plan's measured
    sibilance evidence (analysis/spectral.py:sibilance_evidence).
    """
    if strength <= 0.02:
        return signal
    max_reduction_db = 5.0 * strength
    # More sensitive (lower threshold percentile, so it engages on more of
    # the track) as strength rises — a source that measurably needs more
    # correction should also get caught more often, not just harder each
    # time it does trigger.
    threshold_percentile = 78.0 - 18.0 * strength
    return _dynamic_eq_narrowband(signal, sr, center_hz, q, max_reduction_db, release_ms, threshold_percentile=threshold_percentile)


def _build_stereo_from_ms(mid: np.ndarray, side: np.ndarray) -> np.ndarray:
    left = mid + side
    right = mid - side
    return np.stack([left, right], axis=1)
