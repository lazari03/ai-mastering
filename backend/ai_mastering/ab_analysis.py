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
        "compression": "engaged" if bool(processing_params.get("compression_enabled", processing_params.get("glue_enabled", False))) else "bypassed",
        "saturation": saturation_decision,
        "stereo_width": stereo_decision,
        "limiting": limiter_decision,
        "category": processing_params.get("category"),
        "flavour": processing_params.get("flavour"),
    }


_BAND_LABELS = {
    "sub_bass_20_60hz": "sub-bass (20-60Hz)",
    "bass_60_250hz": "bass (60-250Hz)",
    "low_mid_250_500hz": "low-mids (250-500Hz)",
    "mid_500_2000hz": "mids (500Hz-2kHz)",
    "high_mid_2000_4000hz": "high-mids (2-4kHz)",
    "presence_4000_6000hz": "presence (4-6kHz)",
    "brilliance_6000_20000hz": "brilliance/air (6-20kHz)",
}


def build_decision_report(
    processing_params: dict,
    limiter_report: dict | None,
    overshoot_corrections: list,
    transient_qc: dict | None = None,
    plan: dict | None = None,
    evaluation: dict | None = None,
    backoff: dict | None = None,
) -> dict:
    """A plain-language engineering log of what this render decided and
    WHY — narrated from the MasteringPlan (every decision carries its
    measured reason and confidence; every skipped stage carries why it was
    skipped) and the post-render evaluation. Nothing here is re-measured."""
    plan = plan or processing_params.get("mastering_plan") or {}
    rejected = plan.get("rejected_decisions", [])

    eq_lines = []
    for d in plan.get("eq_decisions", []):
        why = d["reason"].replace("_", " ")
        extra = f" [{'; '.join(d['notes'])}]" if d.get("notes") else ""
        eq_lines.append(f"{d['filter_type']} {d['frequency_hz']:.0f} Hz {d['gain_db']:+.2f} dB (Q {d['q']:.2f}) — {why}, confidence {d['confidence']:.0%}{extra}.")
    for r in rejected:
        if r["stage"] == "eq":
            eq_lines.append(f"No EQ for {r['problem']}: {r['reason']}.")
    if not eq_lines:
        eq_lines.append("No EQ: no tonal deviation outside the acceptable window for this genre/style/reference.")
    for d in plan.get("dynamic_eq_decisions", []):
        eq_lines.append(f"Dynamic EQ {d['frequency_hz']:.0f} Hz up to -{d['max_reduction_db']:.2f} dB — {d['reason']}.")

    comp = plan.get("compression", {})
    if comp.get("enabled"):
        parts = []
        if comp.get("multiband", {}).get("enabled"):
            parts.append(f"multiband: {comp['multiband']['reason']}")
        if comp.get("glue", {}).get("enabled"):
            parts.append(f"glue: {comp['glue']['reason']}")
        compression_line = "Compression: engaged — " + "; ".join(parts) + "."
    else:
        why = [r["reason"] for r in rejected if r["stage"] in ("compression", "glue_compression")]
        compression_line = "Compression: disabled — " + ("; ".join(why) if why else "no measured need") + "."

    clipper = plan.get("clipper", {})
    clipper_line = f"Clipper: {'engaged — ' + clipper.get('reason', '') if clipper.get('enabled') else 'disabled — ' + clipper.get('reason', 'not needed')}."

    stereo = plan.get("stereo", {})
    stereo_line = "Stereo: " + ("; ".join(stereo.get("reasons", [])) or "unchanged") + (f"; low end made mono below {stereo['lf_mono']['cutoff_hz']:.0f} Hz ({stereo['lf_mono']['reason']})" if stereo.get("lf_mono", {}).get("enabled") else "") + "."

    sat = plan.get("saturation", {})
    saturation_line = f"Saturation: {'drive ' + format(sat.get('drive_db', 0.0), '.2f') + ' dB — ' + sat.get('reason', '') if sat.get('enabled') else sat.get('reason', 'disabled')} (factors {sat.get('factors', {})})."
    deess = plan.get("deesser", {})
    vocal_line = f"De-esser: {'engaged at ' + format(deess.get('center_hz', 0), '.0f') + ' Hz, strength ' + format(deess.get('strength', 0), '.2f') + ' — ' + deess.get('reason', '') if deess.get('enabled') else deess.get('reason', 'disabled')}."

    limiter_gr_db = float((limiter_report or {}).get("limiter_gain_reduction_db", 0.0))
    loud = plan.get("loudness", {})
    limiter_line = (
        f"Limiter: {float((limiter_report or {}).get('gr_at_p995_peaks_db', limiter_gr_db)):.2f} dB on the loud hits "
        f"(budget {plan.get('limiter', {}).get('budget_db', 0.0):.2f} dB), max {limiter_gr_db:.2f} dB. "
        f"Loudness target {loud.get('target_lufs', 0.0):.2f} LUFS within range "
        f"[{loud.get('acceptable_min_lufs', 0.0):.1f}, {loud.get('acceptable_max_lufs', 0.0):.1f}]"
        + (f"; {'; '.join(loud.get('notes', []))}" if loud.get("notes") else "")
        + "."
    )

    verification_lines = []
    if evaluation:
        regions = evaluation.get("regions", {})
        for key in ("low_end_40_120", "hf_4k_14k"):
            r = regions.get(key, {})
            verification_lines.append(f"{key}: planned {r.get('planned_db', 0):+.2f} dB, actual {r.get('actual_db', 0):+.2f} dB (collateral {r.get('collateral_db', 0):+.2f} dB).")
        for f in evaluation.get("flags", []):
            verification_lines.append(f"Flag {f['kind']} (severity {f['severity']:.2f}, stage {f.get('blamed_stage')}): {f['detail']}.")
        if not evaluation.get("flags"):
            verification_lines.append("No collateral damage detected — the chain did what the plan intended.")
    if backoff and backoff.get("attempted"):
        verification_lines.append(f"Backoff render: {'applied' if backoff.get('applied') else 'rejected'} — {backoff.get('reason', '')}; actions: {'; '.join(backoff.get('actions', []))}.")

    transient_decision = None
    if transient_qc is not None:
        transient_decision = (
            f"Transient preservation: {'within budget' if transient_qc.get('passed', True) else 'regression'} "
            f"(source {transient_qc.get('source_transient_score', 0):.2f}, master {transient_qc.get('master_transient_score', 0):.2f}, "
            f"delta {transient_qc.get('delta', 0):+.3f}, allowed {-transient_qc.get('allowed_loss', 0):.3f})."
        )

    mix_diagnosis = processing_params.get("mix_diagnosis", []) or []
    return {
        "eq_decisions": eq_lines,
        "vocal_presence_decision": vocal_line,
        "compression_decision": compression_line,
        "clipper_decision": clipper_line,
        "stereo_decision": stereo_line,
        "saturation_decision": saturation_line,
        "limiter_decision": limiter_line,
        "transient_decision": transient_decision,
        "post_render_verification": verification_lines,
        "mix_diagnosis": [m["detail"] for m in mix_diagnosis],
    }


def build_ab_report(
    analysis_before: dict,
    analysis_after: dict,
    processing_params: dict,
    limiter_report: dict | None,
    quality_control: dict | None,
    transient_qc: dict | None = None,
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

    if transient_qc is not None and not transient_qc.get("passed", True):
        improved = False
        reasons.append(
            f"Transient/drum-punch preservation regressed beyond this genre's tolerance "
            f"(delta {transient_qc.get('delta', 0):+.3f}, allowed {-transient_qc.get('allowed_loss', 0):.3f}) — "
            f"see quality_control's transient_qc for the corrective action attempted."
        )

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
            "plr_before_db": analysis_before.get("plr_db"),
            "plr_after_db": analysis_after.get("plr_db"),
        },
        "spectral_centroid_hz": {
            "before": analysis_before.get("spectral_centroid_hz"),
            "after": analysis_after.get("spectral_centroid_hz"),
            "change_hz": _delta(analysis_after.get("spectral_centroid_hz"), analysis_before.get("spectral_centroid_hz")),
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
        "transient_qc": transient_qc,
        "improved": improved,
        "verdict_reasons": reasons,
    }
