from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from pedalboard import Compressor, HighpassFilter, PeakFilter, Pedalboard
from scipy.signal import butter, sosfiltfilt

import numba

import copy

from ai_mastering.ab_analysis import build_ab_report
from ai_mastering.analysis.dynamics import peak_percentile_db
from ai_mastering.audio_utils import MASTER_SR, _ab_gain_match, _analysis_from_audio, _db, _load_audio, _true_peak_db, resolve_master_sr
from ai_mastering.bus_processing import _limiter_reduction_db, _soft_clip, _true_peak_limiter
from ai_mastering.dsp_filters import _dynamic_eq_narrowband, _lr4_highpass, _oversampled_distortion
from ai_mastering.planning import config as C
from ai_mastering.quality_control import InvalidAudioError, lr_balance_db, rebalance_channels, run_quality_control, validate_input_signal

"""MANUAL CHAIN ENGINE. Interprets the full professional-preset JSON schema used by
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
    # pedalboard's HighpassFilter is FIRST order (6 dB/oct — measured 5.9).
    # This used to assume 12 dB/oct per stage, so every preset got half
    # the slope it asked for (24 -> 12 dB/oct).
    stages = max(1, round(slope / 6.0))
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


def _apply_limiter(stereo: np.ndarray, sr: int, cfg: dict, trim_db: float = 0.0) -> tuple[np.ndarray, dict]:
    """Loudness target (if any), then the shared true-peak limiter — with the
    adaptive engine's limiter damage budget: if reaching the target would
    take more than C.LIMITER_BUDGET_MAX_DB off the loud hits, the target is
    lowered instead. `trim_db` lowers the level further (used by the final
    QC recovery pass). Returns the audio and a report of what happened."""
    meter = pyln.Meter(sr)
    report = {"requested_target_lufs": None, "budget_trim_db": 0.0, "recovery_trim_db": round(trim_db, 2)}
    target_lufs = cfg.get("target_lufs_i")
    if target_lufs is not None:
        report["requested_target_lufs"] = float(target_lufs)
        loudness = float(meter.integrated_loudness(stereo))
        if np.isfinite(loudness):
            stereo = pyln.normalize.loudness(stereo, loudness, float(target_lufs))

    ceiling_db = float(cfg.get("ceiling_dbtp", C.LIMITER_CEILING_DBTP))
    if not stereo.size:
        return stereo, report
    loud_hits_db = peak_percentile_db(stereo, sr)
    needed_gr_db = loud_hits_db - ceiling_db
    if needed_gr_db > C.LIMITER_BUDGET_MAX_DB:
        report["budget_trim_db"] = round(needed_gr_db - C.LIMITER_BUDGET_MAX_DB, 2)
    total_trim_db = report["budget_trim_db"] + trim_db
    if total_trim_db > 0:
        stereo = stereo * _db_to_lin(-total_trim_db)
    pre = stereo
    # Same gain-only oversampled lookahead limiter the adaptive engine's
    # professional tier uses (ai_mastering/bus_processing.py) — a real
    # limiter (anticipates peaks, smooths release) rather than a single
    # scalar trim after the fact. Still never boosts, still not
    # pedalboard.Limiter — that one applies makeup gain toward its ceiling,
    # which would undo the LUFS target just set above.
    limited = np.asarray(_true_peak_limiter(pre, sr, ceiling_db=ceiling_db), dtype=np.float32)
    report["max_gr_db"] = round(_limiter_reduction_db(pre, limited), 3)
    report["gr_at_p995_peaks_db"] = round(max(0.0, peak_percentile_db(pre, sr) - peak_percentile_db(limited, sr)), 3)
    report["budget_db"] = C.LIMITER_BUDGET_MAX_DB
    return limited, report


# ---------------------------------------------------------------- safety ---
#
# A full preset is a manual chain: the tonal moves (EQ, width) are the
# user's, and stay theirs within wide bounds. The stages that decide how a
# master survives delivery — peak ceiling, how hard the limiter and clipper
# work, saturation drive — are held to the adaptive engine's own limits
# (ai_mastering/planning/config.py), so an imported or hand-built chain
# can't ship something the adaptive engine would refuse to. Every value
# that gets pulled back is reported, never changed silently.

MANUAL_EQ_MAX_DB = 6.0
MANUAL_COMPRESSOR_MAX_RATIO = 4.0
MANUAL_COMPRESSOR_MAX_GR_DB = 6.0
MANUAL_DYNAMIC_EQ_MAX_GR_DB = 6.0
MANUAL_MAX_TARGET_LUFS = -7.0
MANUAL_SIDE_GAIN_RANGE = (-1.0, 0.5)
MANUAL_MONO_BELOW_MAX_HZ = 300.0
MANUAL_HEADROOM_RANGE_DB = (-24.0, -1.0)
# Saturation drive is amount * 60 dB in this engine (see _apply_saturation),
# so the adaptive engine's max drive maps to this amount.
MANUAL_SATURATION_MAX_AMOUNT = C.SATURATION_MAX_DRIVE_DB / 60.0

# Final-QC failures a quieter render can fix. Anything else (NaN, silence,
# phase cancellation) means the chain itself is broken — refuse delivery.
RECOVERABLE_QC_FAILURES = {"limiter_gain_reduction", "dynamics_preservation", "plr", "true_peak", "clipping"}
RECOVERY_TRIMS_DB = (2.0, 4.0, 6.0)


def _clamp(adjustments: list[str], label: str, value: float, lo: float, hi: float, why: str) -> float:
    clamped = float(np.clip(value, lo, hi))
    if abs(clamped - value) > 1e-9:
        adjustments.append(f"{label}: {value:g} -> {clamped:g} ({why})")
    return clamped


def enforce_safety_limits(processing: dict, quality_control: dict | None) -> tuple[dict, float, list[str]]:
    """Returns (safe processing copy, true-peak ceiling, adjustments)."""
    p = copy.deepcopy(processing or {})
    adj: list[str] = []

    inp = p.get("input")
    if inp and "headroom_target_db" in inp:
        inp["headroom_target_db"] = _clamp(adj, "input.headroom_target_db", float(inp["headroom_target_db"]), *MANUAL_HEADROOM_RANGE_DB, "input gain staging range")

    for i, band in enumerate(p.get("eq") or []):
        if "gain_db" in band:
            band["gain_db"] = _clamp(adj, f"eq[{i}].gain_db", float(band["gain_db"]), -MANUAL_EQ_MAX_DB, MANUAL_EQ_MAX_DB, f"manual EQ limited to ±{MANUAL_EQ_MAX_DB:g} dB")

    comp = p.get("bus_compressor")
    if comp:
        comp["ratio"] = _clamp(adj, "bus_compressor.ratio", float(comp.get("ratio", 2.0)), 1.0, MANUAL_COMPRESSOR_MAX_RATIO, "bus compression ratio cap")
        comp["max_gain_reduction_db"] = _clamp(adj, "bus_compressor.max_gain_reduction_db", float(comp.get("max_gain_reduction_db", 3.0)), 0.0, MANUAL_COMPRESSOR_MAX_GR_DB, "bus compression reduction cap")

    for i, band in enumerate(p.get("dynamic_eq") or []):
        if "max_gain_reduction_db" in band:
            band["max_gain_reduction_db"] = -_clamp(adj, f"dynamic_eq[{i}].max_gain_reduction_db", abs(float(band["max_gain_reduction_db"])), 0.0, MANUAL_DYNAMIC_EQ_MAX_GR_DB, "dynamic EQ reduction cap")

    sat = p.get("saturation")
    if sat and sat.get("enabled"):
        sat["amount"] = _clamp(adj, "saturation.amount", float(sat.get("amount", 0.03)), 0.0, MANUAL_SATURATION_MAX_AMOUNT, f"saturation drive capped at {C.SATURATION_MAX_DRIVE_DB:g} dB like the adaptive engine")

    st = p.get("stereo")
    if st:
        if st.get("low_end_mono_below_hz"):
            st["low_end_mono_below_hz"] = _clamp(adj, "stereo.low_end_mono_below_hz", float(st["low_end_mono_below_hz"]), 20.0, MANUAL_MONO_BELOW_MAX_HZ, "mono-bass cutoff range")
        for i, band in enumerate(st.get("bands") or []):
            if "gain" in band:
                band["gain"] = _clamp(adj, f"stereo.bands[{i}].gain", float(band["gain"]), *MANUAL_SIDE_GAIN_RANGE, "width change range")

    clip = p.get("clipper")
    if clip and clip.get("enabled"):
        clip["drive_db"] = _clamp(adj, "clipper.drive_db", float(clip.get("drive_db", 0.0)), 0.0, C.CLIPPER_MAX_SHARE_DB, f"clipper limited to {C.CLIPPER_MAX_SHARE_DB:g} dB like the adaptive engine")

    lim = p.get("limiter")
    if not lim:
        # No limiter in the chain still gets the delivery ceiling — never
        # a bare scalar trim, never an unguarded peak.
        p["limiter"] = lim = {}
        adj.append(f"limiter: none in the chain -> added a {C.LIMITER_CEILING_DBTP:g} dBTP true-peak safety limiter")
    lim["ceiling_dbtp"] = _clamp(adj, "limiter.ceiling_dbtp", float(lim.get("ceiling_dbtp", C.LIMITER_CEILING_DBTP)), -6.0, C.LIMITER_CEILING_DBTP, "delivery ceiling")
    if lim.get("target_lufs_i") is not None:
        lim["target_lufs_i"] = _clamp(adj, "limiter.target_lufs_i", float(lim["target_lufs_i"]), -30.0, MANUAL_MAX_TARGET_LUFS, "loudness target cap")

    qc_ceiling = float((quality_control or {}).get("true_peak_ceiling_dbtp", lim["ceiling_dbtp"]))
    ceiling = _clamp(adj, "quality_control.true_peak_ceiling_dbtp", qc_ceiling, -6.0, C.LIMITER_CEILING_DBTP, "delivery ceiling")
    # The limiter must aim at least as low as what QC will check.
    lim["ceiling_dbtp"] = min(lim["ceiling_dbtp"], ceiling)
    return p, ceiling, adj


# ------------------------------------------------------------------ main ---


def render_preset_master(input_path: str, output_wav_path: str, preset: dict) -> dict:
    """Runs the full processing/quality_control/output spec from a
    professional preset JSON against real audio. `preset` is one preset
    object — same shape as an entry in mixing_presets.json."""
    processing = preset.get("processing") or {}
    # Native rate (44.1/48/88.2/96 kHz), same rule as the adaptive engine —
    # this path used to resample every 48 kHz source to 44.1 kHz.
    try:
        probe_sr = int(sf.info(str(input_path)).samplerate)
    except Exception:
        probe_sr = MASTER_SR
    stereo, sr = _load_audio(input_path, sr=resolve_master_sr(probe_sr))

    # Same input-validation/DC-offset-correction stage the adaptive engine
    # runs (ai_mastering/quality_control.py) — one engineering-integrity
    # check shared by both engines rather than reimplemented per-engine.
    # InvalidAudioError propagates up to the caller (app/services/
    # mastering_service.py maps it to a 400, same as the adaptive path).
    input_validation = validate_input_signal(stereo, sr)
    stereo = input_validation.pop("_corrected_audio")
    source_lr_balance_db = lr_balance_db(stereo)

    # Full analysis (spectral balance, dynamic range, stereo width/
    # correlation, etc.) — same measurement function the adaptive engine
    # uses, so the frontend's before/after table has the same shape no
    # matter which engine rendered the master.
    analysis_before = _analysis_from_audio(stereo, sr)

    processing, ceiling_db, safety_adjustments = enforce_safety_limits(processing, preset.get("quality_control"))

    stereo = _apply_input_stage(stereo, processing.get("input"))
    stereo = _apply_highpass(stereo, sr, processing.get("highpass_filter"))
    stereo = _apply_static_eq(stereo, sr, processing.get("eq"))
    stereo = _apply_bus_compressor(stereo, sr, processing.get("bus_compressor"))
    stereo = _apply_dynamic_eq(stereo, sr, processing.get("dynamic_eq"))
    stereo = _apply_saturation(stereo, sr, processing.get("saturation"))
    pre_dynamics = _apply_stereo(stereo, sr, processing.get("stereo"))

    # Field shape the shared QC/AB modules expect from a processing-params
    # dict — this engine interprets a literal preset spec rather than
    # computing per-band deltas from analysis, so eq_correction is reported
    # as "bypassed" (no single 7-band delta to summarize an arbitrary EQ
    # band list into) rather than guessed.
    qc_params = {
        "saturation_amount": float((processing.get("saturation") or {}).get("amount", 0.0)) if (processing.get("saturation") or {}).get("enabled") else 0.0,
        "glue_enabled": bool(processing.get("bus_compressor")),
        "side_gain": 1.0,
        "per_band_gain_changes_db": {},
        "category": None,
        "flavour": None,
    }

    def render_bus(trim_db: float, clipper_cfg: dict | None):
        x = _apply_clipper(pre_dynamics, clipper_cfg)
        clipper_gr = max(0.0, _true_peak_db(pre_dynamics) - _true_peak_db(x)) if clipper_cfg and clipper_cfg.get("enabled") else 0.0
        limited, lim = _apply_limiter(x, sr, processing["limiter"], trim_db=trim_db)
        report = {
            # Deepest single reduction anywhere in the track, and the
            # reduction across the loud hits (99.5th-percentile peaks) —
            # the same two numbers the adaptive engine reports.
            "limiter_gain_reduction_db": lim.get("max_gr_db", 0.0),
            "gr_at_p995_peaks_db": lim.get("gr_at_p995_peaks_db", 0.0),
            "clipper_gain_reduction_db": round(clipper_gr, 3),
            "budget_db": lim.get("budget_db"),
            "budget_trim_db": lim.get("budget_trim_db", 0.0),
            "recovery_trim_db": lim.get("recovery_trim_db", 0.0),
            "requested_target_lufs": lim.get("requested_target_lufs"),
            "post_limiter_peak_db": round(_true_peak_db(limited), 3) if limited.size else 0.0,
            "true_peak_aware": True,
        }
        after = _analysis_from_audio(limited, sr)
        qc = run_quality_control(
            analysis_before=analysis_before,
            analysis_after=after,
            mastered_audio=limited,
            processing_params=qc_params,
            limiter_report=report,
            true_peak_ceiling_db=ceiling_db,
            source_lr_balance_db=source_lr_balance_db,
        )
        return limited, report, after, qc

    stereo, limiter_report, analysis_after, quality_control = render_bus(0.0, processing.get("clipper"))
    if limiter_report["budget_trim_db"] > 0:
        safety_adjustments.append(
            f"limiter: loudness lowered {limiter_report['budget_trim_db']:.1f} dB to keep limiter reduction on the loud hits within {C.LIMITER_BUDGET_MAX_DB:g} dB"
        )

    qc_corrections = []
    failing_ids = {c["id"] for c in quality_control["checks"] if c["status"] == "fail"}
    if "channel_balance" in failing_ids:
        stereo = rebalance_channels(stereo, source_lr_balance_db)
        qc_corrections.append(f"channel_balance: L/R restored to the source's {source_lr_balance_db:+.1f} dB balance")
    if "dc_offset" in failing_ids:
        stereo = stereo - np.mean(stereo, axis=0, keepdims=True).astype(np.float32)
        qc_corrections.append("dc_offset: removed residual DC offset from the final render")
    if qc_corrections:
        analysis_after = _analysis_from_audio(stereo, sr)
        quality_control = run_quality_control(
            analysis_before=analysis_before,
            analysis_after=analysis_after,
            mastered_audio=stereo,
            processing_params=qc_params,
            limiter_report=limiter_report,
            true_peak_ceiling_db=ceiling_db,
            source_lr_balance_db=source_lr_balance_db,
        )

    # Final QC gates delivery, same rule as the adaptive engine: a failed
    # master is never written. Level-related failures get quieter,
    # clipper-free re-renders of the same chain; anything else — or no
    # passing candidate — means no file.
    recovery = None
    if not quality_control["passed"]:
        failed = {c["id"] for c in quality_control["checks"] if c["status"] == "fail"}
        if not failed.issubset(RECOVERABLE_QC_FAILURES):
            raise InvalidAudioError(f"Manual chain failed final quality control ({', '.join(sorted(failed))}); no master was delivered.")
        for trim_db in RECOVERY_TRIMS_DB:
            c_audio, c_report, c_after, c_qc = render_bus(trim_db, None)
            if c_qc["passed"]:
                stereo, limiter_report, analysis_after, quality_control = c_audio, c_report, c_after, c_qc
                recovery = {"failed_checks": sorted(failed), "clipper_disabled": True, "level_lowered_db": trim_db}
                safety_adjustments.append(
                    f"final QC failed ({', '.join(sorted(failed))}) -> re-rendered with the clipper off and {trim_db:g} dB less level"
                )
                break
        if recovery is None:
            raise InvalidAudioError(
                f"Manual chain failed final quality control ({', '.join(sorted(failed))}) even at {RECOVERY_TRIMS_DB[-1]:g} dB lower level; no master was delivered."
            )
    quality_control["corrections_applied"] = qc_corrections

    output_cfg = preset.get("output") or {}
    bit_depth = int(output_cfg.get("bit_depth", 24))
    subtype = "PCM_16" if bit_depth == 16 else "PCM_24"
    dither_cfg = str(output_cfg.get("dither", ""))
    if subtype == "PCM_16" and dither_cfg.startswith("triangular"):
        # Noise-shaped TPDF dominates plain TPDF with no downside (same
        # dither amplitude, just spectrally shaped) — always shape when
        # dithering at all, no preset-level toggle needed for this.
        stereo = _dither_for_bit_depth(stereo, 16, noise_shaping=True)

    if subtype == "PCM_16":
        # Write the integers themselves. libsndfile converts float to 16-bit
        # with a 32767 scale, while the dither quantised to a 1/32768 grid:
        # above half scale the dithered values were re-rounded (undithered)
        # by up to 1 LSB on write. Integer data is written verbatim.
        pcm = np.clip(np.round(np.asarray(stereo, dtype=np.float64) * 32768.0), -32768, 32767).astype(np.int16)
        sf.write(str(output_wav_path), pcm, sr, subtype="PCM_16")
    else:
        sf.write(str(output_wav_path), stereo, sr, subtype=subtype)

    ab_analysis = build_ab_report(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        processing_params=qc_params,
        limiter_report=limiter_report,
        quality_control=quality_control,
    )

    source_warnings = []
    if analysis_before.get("near_mono_source"):
        source_warnings.append(
            "Source file has little to no stereo content (left/right channels are nearly identical) — "
            "mastering can't create real stereo separation that was never in the recording. "
            "The width/wider controls have nothing to widen here."
        )
    if not ab_analysis["improved"]:
        source_warnings.extend(f"Improvement check: {reason}" for reason in ab_analysis["verdict_reasons"])

    return {
        "analysis_before": analysis_before,
        "analysis_after": analysis_after,
        "quality_control": quality_control,
        "ab_analysis": ab_analysis,
        "processing_applied": {
            "engine": "preset_dsp_engine",
            # A literal, user-specified chain — not the adaptive engine's
            # measure-then-decide plan. The UI labels it as such.
            "chain_type": "manual",
            "stages": list(processing.keys()),
            "safety_adjustments": safety_adjustments,
            "qc_recovery": recovery,
            "limiter": limiter_report,
            "input_validation": input_validation,
            "quality_control_corrections": qc_corrections,
        },
        "ab_gain_match": _ab_gain_match(analysis_before["integrated_lufs"], analysis_after["integrated_lufs"]),
        "source_warnings": source_warnings,
        "target_profile_used": {"genre": preset.get("genre"), "style": preset.get("style")},
    }
