from __future__ import annotations

import numpy as np

from .audio_utils import EPS, _db, _ensure_stereo, _rms, _true_peak_db

# Real automated quality control (spec section 18) — every check here reads
# the actual rendered waveform / actual measured analysis numbers, never a
# hardcoded pass. Two entry points:
#   validate_input_signal — runs first, before analysis/processing (section
#     3's "Input validation" stage); can reject genuinely unusable audio and
#     performs one real correction (DC offset removal) rather than just
#     reporting it.
#   run_quality_control — runs last, against the finished master; reports
#     pass/warn/fail per check, never silently "fixes" anything itself (the
#     caller in mastering.py decides what, if anything, to do about a fail).

DC_OFFSET_THRESHOLD_DB = -50.0  # per-channel |mean| vs full scale; below this is measurement noise, not audible DC
SILENCE_RMS_DB = -70.0
MIN_SAMPLES_FOR_MASTERING = 4410  # 0.1s at 44.1kHz — below this there's nothing to analyze or master
CHANNEL_IMBALANCE_WARN_DB = 6.0


class InvalidAudioError(ValueError):
    """Raised by validate_input_signal for source audio that can't be
    mastered at all — not a quality issue to report and continue past, a
    hard stop before analysis or processing ever runs."""


def validate_input_signal(audio: np.ndarray, sr: int) -> dict:
    """First pipeline stage: real signal-integrity validation on the actual
    uploaded waveform, not a format/extension check (ffmpeg/soundfile
    already reject undecodable files upstream of this).

    Raises InvalidAudioError for input that cannot be mastered at all:
    too short, non-finite samples, or digital silence throughout — these
    are stop conditions, not "issues" to note and proceed past.

    Returns a report dict plus a "_corrected_audio" array (DC offset
    removed when present) that the caller pops and uses for every
    downstream stage — DC offset is corrected here, not just reported,
    because leaving it in would bias every measurement that follows
    (RMS/peak/LUFS all shift with an uncorrected DC component).
    """
    audio = _ensure_stereo(audio).astype(np.float32)

    if audio.shape[0] < MIN_SAMPLES_FOR_MASTERING:
        raise InvalidAudioError(f"Audio is too short to master ({audio.shape[0]} samples at {sr}Hz).")

    if not np.all(np.isfinite(audio)):
        raise InvalidAudioError("Audio contains invalid (NaN/Inf) samples — the file is likely corrupt.")

    peak = float(np.max(np.abs(audio)))
    overall_rms_db = _db(_rms(audio.reshape(-1)))
    if peak < 1e-6 or overall_rms_db < SILENCE_RMS_DB:
        raise InvalidAudioError("Audio is digital silence — there is no signal to master.")

    issues: list[str] = []

    dc_offsets_db = []
    needs_dc_correction = False
    for ch in range(audio.shape[1]):
        dc = float(np.mean(audio[:, ch]))
        dc_db = float(_db(abs(dc))) if abs(dc) > EPS else -240.0
        dc_offsets_db.append(round(dc_db, 2))
        if dc_db > DC_OFFSET_THRESHOLD_DB:
            needs_dc_correction = True

    corrected = audio
    if needs_dc_correction:
        corrected = audio - np.mean(audio, axis=0, keepdims=True).astype(np.float32)
        issues.append(f"DC offset removed (measured per-channel offsets: {dc_offsets_db} dBFS).")

    channel_rms_db = [round(float(_db(_rms(corrected[:, ch]))), 2) for ch in range(corrected.shape[1])]
    channel_imbalance_db = float(max(channel_rms_db) - min(channel_rms_db)) if len(channel_rms_db) > 1 else 0.0
    if channel_imbalance_db > CHANNEL_IMBALANCE_WARN_DB:
        issues.append(f"Significant L/R channel level imbalance in the source ({channel_imbalance_db:.1f}dB).")

    return {
        "valid": True,
        "sample_rate": int(sr),
        "channels": int(audio.shape[1]),
        "duration_s": round(audio.shape[0] / float(sr), 2),
        "dc_offset_db_per_channel": dc_offsets_db,
        "dc_offset_corrected": needs_dc_correction,
        "channel_imbalance_db": round(channel_imbalance_db, 2),
        "issues": issues,
        "_corrected_audio": corrected,
    }


def _add(checks: list[dict], check_id: str, status: str, message: str, value: float | None = None) -> None:
    checks.append({"id": check_id, "status": status, "message": message, "value": value})


def run_quality_control(
    *,
    analysis_before: dict,
    analysis_after: dict,
    mastered_audio: np.ndarray,
    processing_params: dict,
    limiter_report: dict | None,
    true_peak_ceiling_db: float = -1.0,
) -> dict:
    """QC pass on the finished master. Answers "is this output technically
    sound" — clipping, true peak, over-processing, phase/mono safety,
    channel integrity, rendering errors. See ab_analysis.build_ab_report for
    the separate "did this actually improve the source" verdict."""
    mastered_audio = _ensure_stereo(mastered_audio).astype(np.float32)
    checks: list[dict] = []

    finite = bool(np.all(np.isfinite(mastered_audio)))
    if finite:
        _add(checks, "rendering_integrity", "pass", "Rendered audio contains only finite samples.")
    else:
        _add(checks, "rendering_integrity", "fail", "Rendered audio contains NaN/Inf samples — rendering error.")

    clipping = bool(analysis_after.get("clipping_detected", False)) or bool(np.any(np.abs(mastered_audio) >= 0.9999))
    _add(
        checks,
        "clipping",
        "fail" if clipping else "pass",
        "Full-scale clipping detected in the final master." if clipping else "No full-scale clipping in the final master.",
    )

    true_peak_db = float(analysis_after.get("true_peak_db", _true_peak_db(mastered_audio)))
    tp_tolerance_db = 0.15
    if true_peak_db > true_peak_ceiling_db + tp_tolerance_db:
        _add(
            checks,
            "true_peak",
            "fail",
            f"True peak {true_peak_db:.2f}dBTP exceeds the {true_peak_ceiling_db:.1f}dBTP ceiling.",
            true_peak_db,
        )
    else:
        _add(
            checks,
            "true_peak",
            "pass",
            f"True peak {true_peak_db:.2f}dBTP is within the {true_peak_ceiling_db:.1f}dBTP ceiling.",
            true_peak_db,
        )

    limiter_gr_db = float((limiter_report or {}).get("limiter_gain_reduction_db", 0.0))
    if limiter_gr_db > 6.0:
        _add(
            checks,
            "limiter_gain_reduction",
            "fail",
            f"Limiter gain reduction of {limiter_gr_db:.1f}dB is heavy enough to risk audible pumping or distortion.",
            limiter_gr_db,
        )
    elif limiter_gr_db > 3.0:
        _add(
            checks,
            "limiter_gain_reduction",
            "warn",
            f"Limiter gain reduction of {limiter_gr_db:.1f}dB is moderate — worth listening for pumping.",
            limiter_gr_db,
        )
    else:
        _add(checks, "limiter_gain_reduction", "pass", f"Limiter gain reduction of {limiter_gr_db:.1f}dB is light.", limiter_gr_db)

    dr_before_db = float(analysis_before.get("dynamic_range_db", 0.0))
    dr_after_db = float(analysis_after.get("dynamic_range_db", 0.0))
    dr_collapse_db = dr_before_db - dr_after_db
    if dr_collapse_db > 9.0:
        _add(
            checks,
            "dynamics_preservation",
            "fail",
            f"Dynamic range collapsed by {dr_collapse_db:.1f}dB — the master is likely over-compressed or over-limited.",
            dr_collapse_db,
        )
    elif dr_collapse_db > 6.0:
        _add(
            checks,
            "dynamics_preservation",
            "warn",
            f"Dynamic range reduced by {dr_collapse_db:.1f}dB — check for over-processing.",
            dr_collapse_db,
        )
    else:
        _add(
            checks,
            "dynamics_preservation",
            "pass",
            f"Dynamic range change ({-dr_collapse_db:+.1f}dB) is within normal mastering bounds.",
            dr_collapse_db,
        )

    saturation_amount = float(processing_params.get("saturation_amount", 0.0))
    if saturation_amount > 0.20:
        _add(checks, "saturation_amount", "warn", f"Saturation amount ({saturation_amount:.3f}) is on the high side.", saturation_amount)
    else:
        _add(checks, "saturation_amount", "pass", f"Saturation amount ({saturation_amount:.3f}) is conservative.", saturation_amount)

    correlation = float(analysis_after.get("stereo_correlation", 1.0))
    if correlation < -0.5:
        _add(checks, "phase_correlation", "fail", f"Phase correlation {correlation:.2f} is likely to cancel badly in mono.", correlation)
    elif correlation < 0.0:
        _add(checks, "phase_correlation", "warn", f"Phase correlation {correlation:.2f} — check mono compatibility.", correlation)
    else:
        _add(checks, "phase_correlation", "pass", f"Phase correlation {correlation:.2f} is mono-safe.", correlation)

    mono_risk = bool(analysis_after.get("mono_compatibility_risk", False))
    _add(
        checks,
        "mono_compatibility",
        "warn" if mono_risk else "pass",
        "Mono compatibility risk detected in the final master." if mono_risk else "Master is mono-compatible.",
    )

    after_rms_db = float(analysis_after.get("rms_db", -100.0))
    before_rms_db = float(analysis_before.get("rms_db", -100.0))
    if after_rms_db < SILENCE_RMS_DB and before_rms_db >= SILENCE_RMS_DB:
        _add(
            checks,
            "output_silence",
            "fail",
            "The rendered master is silent even though the source was not — likely a rendering error.",
            after_rms_db,
        )
    else:
        _add(checks, "output_silence", "pass", "Rendered master has audible signal.", after_rms_db)

    channel_rms_db = [_db(_rms(mastered_audio[:, ch])) for ch in range(mastered_audio.shape[1])]
    channel_imbalance_db = float(max(channel_rms_db) - min(channel_rms_db)) if len(channel_rms_db) > 1 else 0.0
    if channel_imbalance_db > CHANNEL_IMBALANCE_WARN_DB:
        _add(checks, "channel_balance", "fail", f"L/R channel imbalance of {channel_imbalance_db:.1f}dB in the final master.", channel_imbalance_db)
    else:
        _add(checks, "channel_balance", "pass", f"L/R channels balanced within {channel_imbalance_db:.1f}dB.", channel_imbalance_db)

    lufs_after = float(analysis_after.get("integrated_lufs", -70.0))
    if lufs_after < -40.0 or lufs_after > -4.0:
        _add(
            checks,
            "loudness_sanity",
            "warn",
            f"Final integrated loudness ({lufs_after:.1f} LUFS) is outside the range a real master should land in.",
            lufs_after,
        )
    else:
        _add(checks, "loudness_sanity", "pass", f"Final integrated loudness ({lufs_after:.1f} LUFS) is plausible.", lufs_after)

    dc_after_db = max(
        (_db(abs(float(np.mean(mastered_audio[:, ch])))) if abs(float(np.mean(mastered_audio[:, ch]))) > EPS else -240.0)
        for ch in range(mastered_audio.shape[1])
    )
    if dc_after_db > DC_OFFSET_THRESHOLD_DB:
        _add(checks, "dc_offset", "warn", f"DC offset of {dc_after_db:.1f}dBFS remains in the final master.", dc_after_db)
    else:
        _add(checks, "dc_offset", "pass", "No meaningful DC offset in the final master.", dc_after_db)

    fails = [c for c in checks if c["status"] == "fail"]
    warns = [c for c in checks if c["status"] == "warn"]
    severity_rank = {"fail": 0, "warn": 1, "pass": 2}
    checks_sorted = sorted(checks, key=lambda c: severity_rank.get(c["status"], 3))

    return {
        "passed": len(fails) == 0,
        "checks": checks_sorted,
        "issues": [c["message"] for c in fails + warns],
        "fail_count": len(fails),
        "warn_count": len(warns),
    }


def rebalance_channels(audio: np.ndarray) -> np.ndarray:
    """Corrective action for a QC-flagged channel imbalance: trims the
    louder channel down to the quieter channel's RMS rather than boosting
    (never risk introducing a new clipping problem while fixing a balance
    one). Used sparingly — only when run_quality_control's channel_balance
    check actually fails on the final render."""
    audio = _ensure_stereo(audio).astype(np.float32)
    left_rms = _rms(audio[:, 0])
    right_rms = _rms(audio[:, 1])
    if left_rms <= EPS or right_rms <= EPS:
        return audio
    corrected = audio.copy()
    if left_rms > right_rms:
        corrected[:, 0] *= float(right_rms / left_rms)
    else:
        corrected[:, 1] *= float(left_rms / right_rms)
    return corrected
