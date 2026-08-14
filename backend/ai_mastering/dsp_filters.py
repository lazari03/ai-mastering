from __future__ import annotations

import numpy as np
from pedalboard import Compressor, Distortion, HighShelfFilter, LowShelfFilter, PeakFilter, Pedalboard
from scipy.signal import butter, lfilter, resample_poly, sosfilt, sosfiltfilt

# Representative center frequency per band, for the dynamic EQ stage in
# _process_band(). Same values already used for that band's static
# shelf/peak filter below — reusing them keeps dynamic EQ targeting the
# same problem area the static EQ was already tuned for, instead of adding
# a second set of magic numbers.
_DYNAMIC_EQ_CENTER_HZ = {
    "sub": 100.0,
    "low": 100.0,
    "punch": 150.0,
    "low_mid": 400.0,
    "high_mid": 2800.0,
    "high": 8000.0,
}
_DYNAMIC_EQ_Q = 1.2


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


def _split_bands(signal: np.ndarray, sr: int) -> dict:
    low = _lr4_lowpass(signal, 250.0, sr)
    high_after_250 = _lr4_highpass(signal, 250.0, sr)

    low_mid = _lr4_lowpass(high_after_250, 2000.0, sr)
    high_after_2k = _lr4_highpass(high_after_250, 2000.0, sr)

    high_mid = _lr4_lowpass(high_after_2k, 6000.0, sr)
    high = _lr4_highpass(high_after_2k, 6000.0, sr)

    return {
        "low": low,
        "low_mid": low_mid,
        "high_mid": high_mid,
        "high": high,
    }


def _split_bands_pro(signal: np.ndarray, sr: int) -> dict:
    # Professional tier only: splits the old single 20-250Hz "low" band into
    # sub (20-90Hz, true sub-bass — slow-moving, no fast transients to
    # preserve) and punch (90-250Hz — kick/bass-note fundamentals, where fast
    # attack actually matters). The free tier's _split_bands is untouched.
    sub = _lr4_lowpass(signal, 90.0, sr)
    high_after_90 = _lr4_highpass(signal, 90.0, sr)

    punch = _lr4_lowpass(high_after_90, 250.0, sr)
    high_after_250 = _lr4_highpass(high_after_90, 250.0, sr)

    low_mid = _lr4_lowpass(high_after_250, 2000.0, sr)
    high_after_2k = _lr4_highpass(high_after_250, 2000.0, sr)

    high_mid = _lr4_lowpass(high_after_2k, 6000.0, sr)
    high = _lr4_highpass(high_after_2k, 6000.0, sr)

    return {
        "sub": sub,
        "punch": punch,
        "low_mid": low_mid,
        "high_mid": high_mid,
        "high": high,
    }


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


def _dynamic_eq_band(signal: np.ndarray, sr: int, band_name: str, max_reduction_db: float, release_ms: float) -> np.ndarray:
    # Narrow-band, level-dependent gain reduction on top of the static
    # shelf/peak EQ already applied — only engages on the hottest ~25% of
    # activity at this band's problem frequency (resonances, harsh peaks),
    # leaving quieter passages untouched. Complements static EQ, doesn't
    # replace it: static EQ makes a fixed correction; this only reacts.
    if max_reduction_db <= 0:
        return signal
    center_hz = _DYNAMIC_EQ_CENTER_HZ.get(band_name)
    if center_hz is None:
        return signal
    narrow = _bandpass(signal, sr, center_hz, _DYNAMIC_EQ_Q)
    env_db = _envelope_db(narrow, sr, release_ms)
    threshold_db = float(np.percentile(env_db, 75))
    reduction_db = np.clip(env_db - threshold_db, 0.0, max_reduction_db)
    gain = 10.0 ** (-reduction_db / 20.0)
    return signal - narrow + narrow * gain


def _to_pedalboard_shape(signal: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(signal[np.newaxis, :], dtype=np.float32)


def _process_band(signal: np.ndarray, sr: int, band_name: str, params: dict, channel: str) -> np.ndarray:
    ratio = params["band_compression_ratio"][band_name]
    threshold = params["band_threshold_db"][band_name]

    if band_name == "low":
        eq_gain = params["per_band_gain_changes_db"]["sub_bass_20_60hz"] * 0.4 + params["per_band_gain_changes_db"]["bass_60_250hz"] * 0.6
    elif band_name == "sub":
        eq_gain = params["per_band_gain_changes_db"]["sub_bass_20_60hz"]
    elif band_name == "punch":
        eq_gain = params["per_band_gain_changes_db"]["bass_60_250hz"]
    elif band_name == "low_mid":
        eq_gain = params["per_band_gain_changes_db"]["low_mid_250_500hz"]
    elif band_name == "high_mid":
        eq_gain = params["per_band_gain_changes_db"]["high_mid_2000_4000hz"] + params["vocal_presence_gain_db"]
    else:
        eq_gain = params["per_band_gain_changes_db"]["brilliance_6000_20000hz"]

    if channel == "side":
        eq_gain *= 0.6

    if params.get("input_clipping_detected") and eq_gain > 0:
        eq_gain *= 0.7
    eq_gain = float(np.clip(eq_gain, -4.0, 2.5))

    # Attack/release/max-reduction are per band, not per band-type bucket —
    # each of the (up to) 5 bands gets its own values from mastering_params.py
    # instead of a 2-3-way ternary baked into this function. Falls back to
    # sensible defaults if a band name isn't in the params dict (shouldn't
    # happen, but this function shouldn't crash a whole master over it).
    attack_ms = float(params.get("band_attack_ms", {}).get(band_name, 40.0))
    release_ms = float(params.get("band_release_ms", {}).get(band_name, 120.0))
    max_reduction_db = float(params.get("band_max_gain_reduction_db", {}).get(band_name, 6.0))

    # Compressor and EQ run as separate stages (not one Pedalboard chain) so
    # the gain-reduction cap below measures only what the compressor did —
    # blending dry signal back in to cap it would otherwise partially undo
    # the EQ move too, which isn't what "max gain reduction" should mean.
    compressor_board = Pedalboard([Compressor(threshold_db=float(threshold), ratio=float(ratio), attack_ms=attack_ms, release_ms=release_ms)])
    compressed = np.asarray(compressor_board(_to_pedalboard_shape(signal), sr)[0], dtype=np.float32)

    in_rms = float(np.sqrt(np.mean(np.square(signal))) + 1e-12)
    out_rms = float(np.sqrt(np.mean(np.square(compressed))) + 1e-12)
    reduction_db = 20.0 * np.log10(in_rms) - 20.0 * np.log10(out_rms)
    if reduction_db > max_reduction_db > 0 and out_rms != in_rms:
        target_ratio = 10.0 ** (-max_reduction_db / 20.0)
        mix = float(np.clip((target_ratio * in_rms - in_rms) / (out_rms - in_rms), 0.0, 1.0))
        compressed = (mix * compressed + (1.0 - mix) * signal).astype(np.float32)

    eq_effects = []
    if band_name in ("low", "sub"):
        eq_effects.append(LowShelfFilter(cutoff_frequency_hz=80.0 if band_name == "sub" else 120.0, gain_db=float(eq_gain), q=0.707))
    elif band_name == "punch":
        eq_effects.append(PeakFilter(cutoff_frequency_hz=150.0, gain_db=float(eq_gain), q=0.9))
    elif band_name == "high":
        eq_effects.append(HighShelfFilter(cutoff_frequency_hz=8000.0, gain_db=float(eq_gain), q=0.707))
    elif band_name == "low_mid":
        eq_effects.append(PeakFilter(cutoff_frequency_hz=400.0, gain_db=float(eq_gain), q=0.9))
    else:
        eq_effects.append(PeakFilter(cutoff_frequency_hz=2800.0, gain_db=float(eq_gain), q=1.0))

    eq_board = Pedalboard(eq_effects)
    processed = np.asarray(eq_board(_to_pedalboard_shape(compressed), sr)[0], dtype=np.float32)

    dyn_eq_max_reduction_db = float(params.get("band_dynamic_eq_max_reduction_db", {}).get(band_name, 0.0))
    dyn_eq_release_ms = release_ms  # reuse this band's own release constant, no new knob needed
    processed = _dynamic_eq_band(processed, sr, band_name, dyn_eq_max_reduction_db, dyn_eq_release_ms)

    return processed


def _build_stereo_from_ms(mid: np.ndarray, side: np.ndarray) -> np.ndarray:
    left = mid + side
    right = mid - side
    return np.stack([left, right], axis=1)
