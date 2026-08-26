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


def _dynamic_eq_narrowband(
    signal: np.ndarray, sr: int, center_hz: float, q: float, max_reduction_db: float, release_ms: float, threshold_percentile: float = 75.0
) -> np.ndarray:
    """Narrow-band, level-dependent gain reduction at one center frequency —
    only engages on the hottest activity above `threshold_percentile`,
    capped at max_reduction_db, leaving quieter passages untouched.
    Complements static EQ, doesn't replace it: static EQ makes a fixed
    correction; this only reacts.

    The shared implementation behind both _dynamic_eq_band below (the
    adaptive engine's per-band dynamic EQ, fixed band centers from
    _DYNAMIC_EQ_CENTER_HZ) and preset_dsp_engine.py's dynamic EQ (a
    processing.dynamic_eq spec can name any frequency/q it wants) — one
    algorithm, two callers with different ways of picking center_hz/q.
    """
    if max_reduction_db <= 0:
        return signal
    narrow = _bandpass(signal, sr, center_hz, q)
    env_db = _envelope_db(narrow, sr, release_ms)
    threshold_db = float(np.percentile(env_db, threshold_percentile))
    reduction_db = np.clip(env_db - threshold_db, 0.0, max_reduction_db)
    gain = 10.0 ** (-reduction_db / 20.0)
    return signal - narrow + narrow * gain


def _dynamic_eq_band(signal: np.ndarray, sr: int, band_name: str, max_reduction_db: float, release_ms: float) -> np.ndarray:
    # Narrow-band, level-dependent gain reduction on top of the static
    # shelf/peak EQ already applied — only engages on the hottest ~25% of
    # activity at this band's problem frequency (resonances, harsh peaks).
    center_hz = _DYNAMIC_EQ_CENTER_HZ.get(band_name)
    if center_hz is None:
        return signal
    return _dynamic_eq_narrowband(signal, sr, center_hz, _DYNAMIC_EQ_Q, max_reduction_db, release_ms, threshold_percentile=75.0)


def _to_pedalboard_shape(signal: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(signal[np.newaxis, :], dtype=np.float32)


def _process_band(signal: np.ndarray, sr: int, band_name: str, params: dict, channel: str) -> np.ndarray:
    ratio = params["band_compression_ratio"][band_name]
    threshold = params["band_threshold_db"][band_name]
    clipping_input = bool(params.get("input_clipping_detected"))

    def shaped_gain(raw_db: float) -> float:
        # Same side-channel damping / clipped-input caution / safety clip
        # every eq_gain used to get once, factored out so each analysis
        # band's own filter point (see the low_mid/high_mid split below)
        # gets identical treatment instead of one value shared across two
        # frequencies.
        gain = float(raw_db)
        if channel == "side":
            gain *= 0.6
        if clipping_input and gain > 0:
            gain *= 0.7
        return float(np.clip(gain, -4.0, 2.5))

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

    per_band_gains = params["per_band_gain_changes_db"]
    eq_effects = []
    if band_name == "low":
        blended = per_band_gains["sub_bass_20_60hz"] * 0.4 + per_band_gains["bass_60_250hz"] * 0.6
        eq_effects.append(LowShelfFilter(cutoff_frequency_hz=120.0, gain_db=shaped_gain(blended), q=0.707))
    elif band_name == "sub":
        eq_effects.append(LowShelfFilter(cutoff_frequency_hz=80.0, gain_db=shaped_gain(per_band_gains["sub_bass_20_60hz"]), q=0.707))
    elif band_name == "punch":
        eq_effects.append(PeakFilter(cutoff_frequency_hz=150.0, gain_db=shaped_gain(per_band_gains["bass_60_250hz"]), q=0.9))
    elif band_name == "high":
        eq_effects.append(HighShelfFilter(cutoff_frequency_hz=8000.0, gain_db=shaped_gain(per_band_gains["brilliance_6000_20000hz"]), q=0.707))
    elif band_name == "low_mid":
        # This DSP band spans 250-2000Hz (see PROCESS_BANDS in
        # audio_utils.py) and covers two distinct analysis corrections:
        # low_mid_250_500hz (mud/boxiness) and mid_500_2000hz (vocal/
        # instrument body — the single largest, perceptually most
        # important analysis band). mid_500_2000hz's computed correction
        # used to be reported in per_band_gain_changes_db but never
        # actually applied to the audio at all — real "calculated but
        # never applied" bug, not a tuning choice. Two separate peak
        # filters (not one blended average) so each problem area gets
        # addressed at its own frequency, the way a mastering engineer
        # would use two EQ points rather than one compromise move.
        eq_effects.append(PeakFilter(cutoff_frequency_hz=400.0, gain_db=shaped_gain(per_band_gains["low_mid_250_500hz"]), q=1.1))
        eq_effects.append(PeakFilter(cutoff_frequency_hz=1100.0, gain_db=shaped_gain(per_band_gains["mid_500_2000hz"]), q=0.8))
    else:  # high_mid
        # Same fix for presence_4000_6000hz (vocal clarity/consonants/
        # attack) — also computed and never applied before this fix.
        # vocal_presence_gain_db keeps its original placement, folded into
        # the high_mid_2000_4000hz point exactly as before (added to the
        # raw dB before the shared clip, matching the pre-fix combined-then
        # -clipped behavior instead of clipping each term separately).
        eq_effects.append(
            PeakFilter(
                cutoff_frequency_hz=2800.0,
                gain_db=shaped_gain(per_band_gains["high_mid_2000_4000hz"] + params["vocal_presence_gain_db"]),
                q=1.1,
            )
        )
        eq_effects.append(PeakFilter(cutoff_frequency_hz=5000.0, gain_db=shaped_gain(per_band_gains["presence_4000_6000hz"]), q=1.0))

    eq_board = Pedalboard(eq_effects)
    processed = np.asarray(eq_board(_to_pedalboard_shape(compressed), sr)[0], dtype=np.float32)

    dyn_eq_max_reduction_db = float(params.get("band_dynamic_eq_max_reduction_db", {}).get(band_name, 0.0))
    dyn_eq_release_ms = release_ms  # reuse this band's own release constant, no new knob needed
    processed = _dynamic_eq_band(processed, sr, band_name, dyn_eq_max_reduction_db, dyn_eq_release_ms)

    return processed


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
    cymbals (~10kHz+) alone — this is deliberately tighter than
    _DYNAMIC_EQ_Q's 1.2, which is tuned for general resonance-taming
    across a whole DSP band, not a specific narrow problem range.
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
