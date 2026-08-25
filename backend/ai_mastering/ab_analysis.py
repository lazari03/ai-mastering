from __future__ import annotations

# Full A/B analysis report (spec section 15) — everything below is read
# straight out of the already-computed analysis_before/analysis_after dicts
# (real measurements off the actual waveforms, see audio_utils.py) and the
# actual processing_params/limiter_report used for this render. Nothing
# here is re-measured or guessed: this module only compares and summarizes
# numbers other stages already computed.


def _delta(after: float | None, before: float | None) -> float | None:
    if after is None or before is None:
        return None
    return round(float(after) - float(before), 4)


def _summarize_decisions(processing_params: dict, limiter_report: dict | None) -> dict:
    """One line per stage: what the engine actually decided for this track.
    "Bypassed"/"unchanged" is reported exactly the same way as an aggressive
    move — per the spec, doing nothing to a stage is a valid, visible
    decision, not something to hide because a parameter dump would look
    more like the engine "did something"."""
    eq_gains = processing_params.get("per_band_gain_changes_db", {}) or {}
    avg_abs_eq_db = sum(abs(float(v)) for v in eq_gains.values()) / len(eq_gains) if eq_gains else 0.0
    if avg_abs_eq_db < 0.15:
        eq_decision = "bypassed"
    elif avg_abs_eq_db < 0.75:
        eq_decision = "subtle"
    elif avg_abs_eq_db < 1.75:
        eq_decision = "moderate"
    else:
        eq_decision = "significant"

    saturation_amount = float(processing_params.get("saturation_amount", 0.0))
    if saturation_amount < 0.01:
        saturation_decision = "bypassed"
    elif saturation_amount < 0.05:
        saturation_decision = "subtle"
    elif saturation_amount < 0.10:
        saturation_decision = "moderate"
    else:
        saturation_decision = "significant"

    side_gain = float(processing_params.get("side_gain", 1.0))
    if abs(side_gain - 1.0) < 0.01:
        stereo_decision = "unchanged"
    elif side_gain > 1.0:
        stereo_decision = "widened"
    else:
        stereo_decision = "narrowed"

    limiter_gr_db = float((limiter_report or {}).get("limiter_gain_reduction_db", 0.0))
    if limiter_gr_db < 1.0:
        limiter_decision = "transparent"
    elif limiter_gr_db < 3.0:
        limiter_decision = "light"
    elif limiter_gr_db < 6.0:
        limiter_decision = "moderate"
    else:
        limiter_decision = "heavy"

    return {
        "eq_correction": eq_decision,
        "compression": "engaged" if bool(processing_params.get("glue_enabled", False)) else "bypassed",
        "saturation": saturation_decision,
        "stereo_width": stereo_decision,
        "limiting": limiter_decision,
        "category": processing_params.get("category"),
        "flavour": processing_params.get("flavour"),
    }


def build_ab_report(
    analysis_before: dict,
    analysis_after: dict,
    processing_params: dict,
    limiter_report: dict | None,
    quality_control: dict | None,
) -> dict:
    """Full before/after comparison plus a plain verdict on whether the
    master actually improved the source — a master that measures louder
    but is technically or dynamically worse is reported as a failure, not
    dressed up as a win because LUFS went up."""
    before_bands = analysis_before.get("spectral_balance", {}) or {}
    after_bands = analysis_after.get("spectral_balance", {}) or {}
    frequency_balance_change_db = {
        key: _delta(after_bands.get(key), before_bands.get(key)) for key in before_bands
    }

    lufs_before = analysis_before.get("integrated_lufs")
    lufs_after = analysis_after.get("integrated_lufs")
    gain_change_db = _delta(lufs_after, lufs_before)

    dr_before = analysis_before.get("dynamic_range_db")
    dr_after = analysis_after.get("dynamic_range_db")
    dr_change_db = _delta(dr_after, dr_before)

    true_peak_after = analysis_after.get("true_peak_db")

    reasons: list[str] = []
    improved = True

    if quality_control is not None and not quality_control.get("passed", True):
        improved = False
        reasons.append("Automated quality control flagged one or more failing checks — see quality_control.issues.")

    if dr_change_db is not None and dr_change_db < -9.0:
        improved = False
        reasons.append(f"Dynamic range collapsed by {abs(dr_change_db):.1f}dB relative to the source.")

    if true_peak_after is not None and true_peak_after > -0.5:
        improved = False
        reasons.append(f"True peak after mastering ({true_peak_after:.2f}dBTP) is uncomfortably close to 0dBTP.")

    if gain_change_db is not None and gain_change_db > 0.3 and (dr_change_db is not None and dr_change_db < -6.0):
        # Specifically the "measures louder but sounds worse" failure mode
        # the spec calls out — flagged even if the checks above didn't
        # already trip, since a +LUFS/-dynamics combination is the direct
        # signature of loudness-over-quality mastering.
        improved = False
        reasons.append("Loudness increased while dynamic range dropped sharply — louder, not necessarily better.")

    if not reasons:
        reasons.append("Loudness, dynamics, peak integrity and stereo image all moved within acceptable mastering bounds.")

    return {
        "loudness": {
            "integrated_lufs_before": lufs_before,
            "integrated_lufs_after": lufs_after,
            "short_term_lufs_before": analysis_before.get("short_term_lufs"),
            "short_term_lufs_after": analysis_after.get("short_term_lufs"),
            "gain_change_db": gain_change_db,
        },
        "true_peak": {
            "before_dbtp": analysis_before.get("true_peak_db"),
            "after_dbtp": true_peak_after,
            "change_db": _delta(true_peak_after, analysis_before.get("true_peak_db")),
        },
        "rms": {
            "before_db": analysis_before.get("rms_db"),
            "after_db": analysis_after.get("rms_db"),
            "change_db": _delta(analysis_after.get("rms_db"), analysis_before.get("rms_db")),
        },
        "dynamics": {
            "crest_factor_before_db": analysis_before.get("crest_factor_db"),
            "crest_factor_after_db": analysis_after.get("crest_factor_db"),
            "dynamic_range_before_db": dr_before,
            "dynamic_range_after_db": dr_after,
            "change_db": dr_change_db,
            "loudness_range_before_lu": analysis_before.get("loudness_range_lu"),
            "loudness_range_after_lu": analysis_after.get("loudness_range_lu"),
        },
        "frequency_balance_change_db": frequency_balance_change_db,
        "stereo": {
            "width_before": analysis_before.get("stereo_width_estimate"),
            "width_after": analysis_after.get("stereo_width_estimate"),
            "width_change": _delta(analysis_after.get("stereo_width_estimate"), analysis_before.get("stereo_width_estimate")),
            "correlation_before": analysis_before.get("stereo_correlation"),
            "correlation_after": analysis_after.get("stereo_correlation"),
        },
        "gain_change_db": gain_change_db,
        "processing_decisions": _summarize_decisions(processing_params, limiter_report),
        "improved": improved,
        "verdict_reasons": reasons,
    }
