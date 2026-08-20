from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from pedalboard import Compressor, HighpassFilter, PeakFilter, Pedalboard
from scipy.signal import butter, sosfiltfilt

import numba

from ai_mastering.audio_utils import MASTER_SR, _ab_gain_match, _analysis_from_audio, _db, _load_audio, _true_peak_db
from ai_mastering.bus_processing import _soft_clip, _true_peak_limiter
from ai_mastering.dsp_filters import _dynamic_eq_narrowband, _lr4_highpass, _oversampled_distortion

"""Interprets the full professional-preset JSON schema used by
mixing_presets.json (input/highpass/eq/bus_compressor/dynamic_eq/saturation/
stereo/clipper/limiter/quality_control/output) and actually renders it,
instead of the schema being parsed but unused. A preset generated externally
(e.g. by an LLM) that follows this shape drives the real signal chain below.

Every stage is optional — a preset only needs the keys it wants to use.
This is a literal spec interpreter, not a second DSP implementation: the
narrow-band dynamic EQ, oversampled saturation, oversampled soft clipper,
and true-peak lookahead limiter are the exact same functions the adaptive
engine (ai_mastering/) uses — imported, not reimplemented — so there is one
DSP implementation behind both engines, not two. What's genuinely specific
to this engine (arbitrary user-specified EQ/dynamic-EQ bands instead of
fixed ones, input gain staging, per-band stereo width, bit-depth dither) is
what actually differs about interpreting a literal spec vs. computing one
adaptively, not a duplicate of anything the adaptive engine does.
"""


def _safe_freq(freq: float, sr: int, lo: float = 20.0) -> float:
    # Presets can come from an LLM, not a DSP engineer — clamp anything a
    # filter would choke on (0Hz, negative, past Nyquist) instead of crashing
    # the whole render over one bad number.
    return float(np.clip(freq, lo, sr / 2.0 - 100.0))


def _lin_to_db(x: float) -> float:
    return _db(max(float(x), 1e-12))


def _db_to_lin(db: float) -> float:
    return float(10 ** (db / 20.0))


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)) + 1e-12))


# ---------------------------------------------------------------- input ----


def _apply_input_stage(stereo: np.ndarray, cfg: dict) -> np.ndarray:
    if not cfg:
        return stereo
    if not cfg.get("auto_gain", True):
        return stereo
    headroom_db = float(cfg.get("headroom_target_db", -6.0))
    peak = float(np.max(np.abs(stereo))) or 1e-9
    gain = _db_to_lin(headroom_db) / peak
    return stereo * gain


# ------------------------------------------------------------- highpass ----


def _apply_highpass(stereo: np.ndarray, sr: int, cfg: dict) -> np.ndarray:
    if not cfg or not cfg.get("enabled"):
        return stereo
    freq = _safe_freq(float(cfg.get("frequency_hz", 20.0)), sr)
    slope = float(cfg.get("slope_db_oct", 12.0))
    # Each pedalboard HighpassFilter stage is a 2nd-order (12dB/oct) section;
    # cascade enough of them to approximate the requested slope.
    stages = max(1, round(slope / 12.0))
    board = Pedalboard([HighpassFilter(cutoff_frequency_hz=freq) for _ in range(stages)])
    return board(stereo.T, sr).T


# -------------------------------------------------------------- static eq --


def _apply_static_eq(stereo: np.ndarray, sr: int, bands: list[dict]) -> np.ndarray:
    if not bands:
        return stereo
    board = Pedalboard(
        [
            PeakFilter(
                cutoff_frequency_hz=_safe_freq(float(b["frequency_hz"]), sr),
                gain_db=float(b.get("gain_db", 0.0)),
                q=max(float(b.get("q", 1.0)), 0.1),
            )
            for b in bands
            if b.get("frequency_hz")
        ]
    )
    return board(stereo.T, sr).T


# --------------------------------------------------------- bus compressor --


def _apply_bus_compressor(stereo: np.ndarray, sr: int, cfg: dict) -> np.ndarray:
    if not cfg:
        return stereo
    ratio = float(cfg.get("ratio", 2.0))
    attack_ms = float(cfg.get("attack_ms", 20.0))
    release_ms = float(cfg.get("release_ms", 150.0))
    max_reduction_db = float(cfg.get("max_gain_reduction_db", 3.0))

    # ponytail: pedalboard.Compressor has no "max gain reduction" clamp or
    # knee/auto-makeup controls, so the threshold is derived from the
    # program's own RMS (making it actually engage) and the result is
    # blended back toward dry if it reduced more than the preset allows.
    mono = stereo.mean(axis=1)
    threshold_db = _lin_to_db(_rms(mono)) - 2.0

    board = Pedalboard([Compressor(threshold_db=threshold_db, ratio=max(ratio, 1.01), attack_ms=attack_ms, release_ms=release_ms)])
    compressed = board(stereo.T, sr).T

    in_rms, out_rms = _rms(stereo), _rms(compressed)
    reduction_db = _lin_to_db(in_rms) - _lin_to_db(out_rms)
    if reduction_db > max_reduction_db > 0 and out_rms != in_rms:
        target_ratio = _db_to_lin(-max_reduction_db)
        mix = float(np.clip((target_ratio * in_rms - in_rms) / (out_rms - in_rms), 0.0, 1.0))
        compressed = mix * compressed + (1 - mix) * stereo
    return compressed


# ---------------------------------------------------------------- dyn eq ---


def _apply_dynamic_eq(stereo: np.ndarray, sr: int, bands: list[dict]) -> np.ndarray:
    # Same _dynamic_eq_narrowband the adaptive engine's per-band dynamic EQ
    # uses (ai_mastering/dsp_filters.py) — this engine just picks arbitrary
    # frequency/q/release straight from the preset spec instead of a fixed
    # band-name lookup.
    if not bands:
        return stereo
    out = stereo.copy()
    for band_cfg in bands:
        freq = _safe_freq(float(band_cfg.get("frequency_hz", 1000.0)), sr)
        q = max(float(band_cfg.get("q", 1.0)), 0.1)
        max_reduction_db = abs(float(band_cfg.get("max_gain_reduction_db", -2.0)))
        release_ms = float(band_cfg.get("release_ms", 100.0))
        for ch in range(out.shape[1]):
            # Engage on the hottest ~30% of this band's activity, capped at
            # the preset's max reduction — a compressor scoped to one band.
            out[:, ch] = _dynamic_eq_narrowband(out[:, ch], sr, freq, q, max_reduction_db, release_ms, threshold_percentile=70.0)
    return out


# ------------------------------------------------------------ saturation ---


def _apply_saturation(stereo: np.ndarray, sr: int, cfg: dict) -> np.ndarray:
    if not cfg or not cfg.get("enabled"):
        return stereo
    amount = float(cfg.get("amount", 0.03))
    drive_db = float(np.clip(amount * 60.0, 0.0, 24.0))  # amount is a 0..~0.1-ish fraction in the source presets
    oversample = max(1, int(cfg.get("oversampling", 4)))

    # Same oversampled-Distortion function the adaptive engine's saturation
    # stage uses (ai_mastering/dsp_filters.py) — it's written for one
    # channel at a time, so this loops both. mixing_presets.json already
    # declares the oversampling knob per-preset.
    driven = np.empty_like(stereo)
    for ch in range(stereo.shape[1]):
        driven[:, ch] = _oversampled_distortion(stereo[:, ch], sr, drive_db, oversample=oversample)

    # Blend rather than commit fully — Distortion at any nonzero drive is
    # audible; `amount` should scale how much saturation character shows,
    # not just how hard the waveshaper is driven.
    mix = float(np.clip(amount * 8.0, 0.0, 1.0))
    return mix * driven + (1 - mix) * stereo


# ---------------------------------------------------------------- stereo ---


def _apply_stereo(stereo: np.ndarray, sr: int, cfg: dict) -> np.ndarray:
    if not cfg:
        return stereo
    mid = (stereo[:, 0] + stereo[:, 1]) / 2
    side = (stereo[:, 0] - stereo[:, 1]) / 2

    mono_below = cfg.get("low_end_mono_below_hz")
    if mono_below:
        # Same LR4 (4th-order, ~24dB/oct) highpass the adaptive engine's own
        # hard mono enforcement uses (ai_mastering/dsp_filters.py) — steeper
        # than a plain 2nd-order Butterworth, so side energy below the
        # cutoff actually collapses to ~0 instead of just being attenuated.
        side = _lr4_highpass(side, _safe_freq(float(mono_below), sr), sr)

    for band in cfg.get("bands", []) or []:
        from_hz = _safe_freq(float(band.get("from_hz", 20.0)), sr)
        to_hz = _safe_freq(float(band.get("to_hz", sr / 2)), sr)
        gain = float(band.get("gain", 0.0))
        if gain == 0.0 or to_hz <= from_hz:
            continue
        sos = butter(2, [from_hz, to_hz], btype="band", fs=sr, output="sos")
        band_side = sosfiltfilt(sos, side)
        side = side - band_side + band_side * (1.0 + gain)

    left = mid + side
    right = mid - side
    return np.stack([left, right], axis=1)


# --------------------------------------------------------------- clipper ---


def _apply_clipper(stereo: np.ndarray, cfg: dict) -> np.ndarray:
    if not cfg or not cfg.get("enabled"):
        return stereo
    ceiling_db = float(cfg.get("ceiling_dbtp", -1.0))
    drive_db = float(cfg.get("drive_db", 0.0))
    oversample = max(1, int(cfg.get("oversampling", 4)))
    # Same oversampled soft clipper the adaptive engine's bus stage uses
    # ahead of its limiter (ai_mastering/bus_processing.py) — this is the
    # function that pattern was ported from originally, now shared instead
    # of duplicated.
    return _soft_clip(stereo, ceiling_db=ceiling_db, oversample=oversample, drive_db=drive_db)


@numba.njit(cache=True)
def _error_feedback_quantize(stereo: np.ndarray, tpdf: np.ndarray, lsb: float) -> np.ndarray:
    # True 1st-order noise-shaped dither: each sample's rounding error is fed
    # back and added to the next sample before it's rounded, which pushes
    # the combined dither+quantization noise spectrum up toward the
    # (less audible) top of the band instead of leaving it flat. This is a
    # per-sample feedback loop — not expressible as a vectorized numpy op —
    # so it's JIT-compiled with numba (already a project dependency) rather
    # than run as a plain Python loop, which measured ~50s on a 3min track
    # vs. ~0.1s here.
    n, channels = stereo.shape
    shaped = np.empty_like(stereo)
    error = np.zeros(channels)
    for i in range(n):
        for c in range(channels):
            x = stereo[i, c] + tpdf[i, c] + error[c]
            q = round(x / lsb) * lsb
            error[c] = x - q
            shaped[i, c] = q
    return shaped


def _dither_for_bit_depth(stereo: np.ndarray, bit_depth: int, noise_shaping: bool = True, seed: int = 0) -> np.ndarray:
    """TPDF dither, optionally noise-shaped, ahead of quantizing down to
    `bit_depth`. Only meaningful when leaving 24-bit: at 24-bit, quantization
    noise is already ~144dB down — far below any real noise floor — so this
    is a no-op there by design, not a missing feature."""
    if bit_depth >= 24:
        return stereo
    lsb = 2.0 ** -(bit_depth - 1)
    rng = np.random.default_rng(seed)
    tpdf = (rng.random(stereo.shape) - rng.random(stereo.shape)) * lsb
    if not noise_shaping:
        return stereo + tpdf
    return _error_feedback_quantize(stereo.astype(np.float64), tpdf, lsb)


# ---------------------------------------------------------------- limiter --


def _apply_limiter(stereo: np.ndarray, sr: int, cfg: dict) -> np.ndarray:
    if not cfg:
        return stereo
    meter = pyln.Meter(sr)
    target_lufs = cfg.get("target_lufs_i")
    if target_lufs is not None:
        loudness = float(meter.integrated_loudness(stereo))
        if np.isfinite(loudness):
            stereo = pyln.normalize.loudness(stereo, loudness, float(target_lufs))

    ceiling_db = float(cfg.get("ceiling_dbtp", -1.0))
    if not stereo.size:
        return stereo
    # Same gain-only oversampled lookahead limiter the adaptive engine's
    # professional tier uses (ai_mastering/bus_processing.py) — a real
    # limiter (anticipates peaks, smooths release) rather than a single
    # scalar trim after the fact. Still never boosts, still not
    # pedalboard.Limiter — that one applies makeup gain toward its ceiling,
    # which would undo the LUFS target just set above.
    return np.asarray(_true_peak_limiter(stereo, sr, ceiling_db=ceiling_db), dtype=np.float32)


# ---------------------------------------------------------- quality report -


def _quality_report(stereo: np.ndarray, sr: int, cfg: dict) -> dict:
    true_peak_db = _true_peak_db(stereo)
    correlation = float(np.corrcoef(stereo[:, 0], stereo[:, 1])[0, 1]) if stereo.shape[0] > 1 else 1.0
    ceiling = float((cfg or {}).get("true_peak_ceiling_dbtp", -1.0))
    return {
        "true_peak_dbtp": round(true_peak_db, 2),
        "true_peak_within_ceiling": bool(true_peak_db <= ceiling + 0.05),
        "phase_correlation": round(correlation, 3),
        "mono_compatible": bool(correlation > -0.2),
        "clipping_detected": bool(np.any(np.abs(stereo) >= 0.999)),
    }


# ------------------------------------------------------------------ main ---


def render_preset_master(input_path: str, output_wav_path: str, preset: dict) -> dict:
    """Runs the full processing/quality_control/output spec from a
    professional preset JSON against real audio. `preset` is one preset
    object — same shape as an entry in mixing_presets.json."""
    processing = preset.get("processing") or {}
    stereo, sr = _load_audio(input_path, sr=MASTER_SR)

    # Full analysis (spectral balance, dynamic range, stereo width/
    # correlation, etc.) — same measurement function the adaptive engine
    # uses, so the frontend's before/after table has the same shape no
    # matter which engine rendered the master.
    analysis_before = _analysis_from_audio(stereo, sr)

    stereo = _apply_input_stage(stereo, processing.get("input"))
    stereo = _apply_highpass(stereo, sr, processing.get("highpass_filter"))
    stereo = _apply_static_eq(stereo, sr, processing.get("eq"))
    stereo = _apply_bus_compressor(stereo, sr, processing.get("bus_compressor"))
    stereo = _apply_dynamic_eq(stereo, sr, processing.get("dynamic_eq"))
    stereo = _apply_saturation(stereo, sr, processing.get("saturation"))
    stereo = _apply_stereo(stereo, sr, processing.get("stereo"))
    stereo = _apply_clipper(stereo, processing.get("clipper"))
    stereo = _apply_limiter(stereo, sr, processing.get("limiter"))

    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    if peak > 0.999:
        stereo = stereo * (0.999 / peak)

    analysis_after = _analysis_from_audio(stereo, sr)
    quality = _quality_report(stereo, sr, preset.get("quality_control"))

    output_cfg = preset.get("output") or {}
    bit_depth = int(output_cfg.get("bit_depth", 24))
    subtype = "PCM_16" if bit_depth == 16 else "PCM_24"
    dither_cfg = str(output_cfg.get("dither", ""))
    if subtype == "PCM_16" and dither_cfg.startswith("triangular"):
        # Noise-shaped TPDF dominates plain TPDF with no downside (same
        # dither amplitude, just spectrally shaped) — always shape when
        # dithering at all, no preset-level toggle needed for this.
        stereo = _dither_for_bit_depth(stereo, 16, noise_shaping=True)

    sf.write(str(output_wav_path), stereo, sr, subtype=subtype)

    source_warnings = []
    if analysis_before.get("near_mono_source"):
        source_warnings.append(
            "Source file has little to no stereo content (left/right channels are nearly identical) — "
            "mastering can't create real stereo separation that was never in the recording. "
            "The width/wider controls have nothing to widen here."
        )

    return {
        "analysis_before": analysis_before,
        "analysis_after": analysis_after,
        "quality_control": quality,
        "processing_applied": {"engine": "preset_dsp_engine", "stages": list(processing.keys())},
        "ab_gain_match": _ab_gain_match(analysis_before["integrated_lufs"], analysis_after["integrated_lufs"]),
        "source_warnings": source_warnings,
        "target_profile_used": {"genre": preset.get("genre"), "style": preset.get("style")},
    }
