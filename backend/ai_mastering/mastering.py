from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, Reverb

from .ab_analysis import build_ab_report, build_decision_report
from .analysis.profile import SourceProfile
from .audio_utils import (
    MASTER_SR,
    _ab_gain_match,
    _analysis_from_audio,
    _load_audio,
    reference_spectrum_only,
)
from .band_levels import band_levels_db, loudness_matched_band_deltas
from .evaluation.backoff import derive_backoff_plan
from .evaluation.evaluate import evaluate_master
from .mastering_params import _apply_user_tweaks, compute_processing_params, public_params
from .output_validation import validate_render
from .planning import config as C
from .processing.render import render_plan
from .quality_control import InvalidAudioError, rebalance_channels, run_quality_control, validate_input_signal
from .section_detection import _db_to_lin, _detect_song_sections, _section_gain_db_envelope
from .stem_separation import _is_stem_separation_requested, _process_accompaniment_stem, _process_vocal_stem, _separate_vocal_stems

__all__ = ["master_track", "InvalidAudioError", "analyze_for_preview", "preview_processing_params"]


def analyze_for_preview(input_path: str | Path) -> dict:
    """The cheap half of master_track() — decode, validate (DC-offset
    correction, NaN/clipping/silence checks), analyze. No DSP, no
    rendering, no output file. Split out so the frontend can request this
    once per upload and then call preview_processing_params(...) as many
    times as the user changes genre/style/category/flavour/tweaks, without
    paying for a full multiband render (or even a re-decode) on every one
    of those clicks."""
    audio_stereo, sr = _load_audio(input_path, sr=MASTER_SR)
    input_validation = validate_input_signal(audio_stereo, sr)
    audio_stereo = input_validation.pop("_corrected_audio")
    analysis = _analysis_from_audio(audio_stereo, sr)
    return {"analysis": analysis, "input_validation": input_validation}


def preview_processing_params(
    analysis: dict,
    genre: str,
    tags: list[str],
    style: str = "modern",
    tweaks: dict | None = None,
    category: str | None = None,
    flavour: str | None = None,
) -> dict:
    """Exactly the parameter-computation half of master_track() — the same
    compute_processing_params + user-tweak-merge + _apply_user_tweaks calls
    a real render uses, on an analysis already produced by
    analyze_for_preview() — so the frontend can show real per-band EQ/
    compression/loudness numbers as the user browses genre/style/category/
    flavour/tweaks, guaranteed to match what a real render with the same
    selection would actually compute (this and master_track() call the
    exact same functions), not a separate approximation that could drift
    out of sync with the real engine."""
    processing_params = compute_processing_params(
        analysis,
        genre=genre,
        tags=tags,
        style=style,
        category=category,
        flavour=flavour,
    )
    # Category/flavour tweak_bias is NOT merged into the sliders any more:
    # it shifts the target context (see planning/target_model.py), so it
    # can only move the destination, never force an EQ move by itself.
    return public_params(_apply_user_tweaks(processing_params, analysis, tweaks or {}))


def _render_and_evaluate(premaster_audio, sr, plan, profile, analysis_before, context):
    render = render_plan(premaster_audio, sr, plan)
    audio = render["audio"]
    # Absolute output safety, independent of any adaptive decision: never
    # hand back a full-scale sample.
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak >= 0.999:
        audio = (audio * (0.999 / peak)).astype(np.float32)
        render["audio"] = audio
        render["report"]["final_sample_peak_trim_db"] = round(20.0 * np.log10(0.999 / peak), 3)
    analysis_after = _analysis_from_audio(audio, sr)
    master_profile = SourceProfile.from_dict(analysis_after["source_profile"])
    evaluation = evaluate_master(
        source=profile,
        master=master_profile,
        master_analysis=analysis_after,
        source_analysis=analysis_before,
        master_audio=audio,
        sr=sr,
        plan=plan,
        context=context,
        render=render,
    )
    return render, analysis_after, evaluation


def master_track(
    input_path: str | Path,
    output_path: str | Path,
    genre: str,
    tags: list[str],
    tweaks: dict | None = None,
    style: str = "modern",
    enable_stem_separation: bool = False,
    tier: str = "standard",
    reference_track_path: str | Path | None = None,
    category: str | None = None,
    flavour: str | None = None,
) -> dict:
    """SOURCE -> high-resolution analysis -> SourceProfile -> problem
    detection -> confidence -> budgets -> target context -> MasteringPlan
    -> DSP render -> post-master analysis -> MasterEvaluation -> (at most
    one) conservative backoff render -> final master.

    Every decision and its reason is returned under
    processing_applied["mastering_diagnostics"]."""
    audio_stereo, sr = _load_audio(input_path, sr=MASTER_SR)

    # Input validation — signal integrity before anything else touches the
    # audio. Raises InvalidAudioError for unusable input; DC offset is
    # corrected here so every downstream measurement sees the clean signal.
    input_validation = validate_input_signal(audio_stereo, sr)
    audio_stereo = input_validation.pop("_corrected_audio")

    analysis_before = _analysis_from_audio(audio_stereo, sr)

    reference_relative_db = None
    reference_info = {"used": False}
    if reference_track_path:
        # Only the reference's spectral SHAPE is used, and only as context
        # (it moves the acceptable tonal target part of the way) — its
        # loudness/dynamics never leak into this render.
        reference_audio, reference_sr = _load_audio(reference_track_path, sr=MASTER_SR)
        ref = reference_spectrum_only(reference_audio, reference_sr)
        reference_relative_db = ref["relative_db"]
        reference_info = {"used": True, "spectral_balance": ref["legacy_shares"], "relative_spectrum_db": ref["relative_db"]}

    processing_params = compute_processing_params(
        analysis_before,
        genre=genre,
        tags=tags,
        style=style,
        category=category,
        flavour=flavour,
        tier=tier,
        reference_relative_db=reference_relative_db,
    )
    processing_params = _apply_user_tweaks(processing_params, analysis_before, tweaks or {})
    plan = processing_params["_plan"]
    context = processing_params["_context"]
    profile = processing_params["_profile"]

    section_info = _detect_song_sections(audio_stereo, sr)
    premaster_audio = audio_stereo
    stem_metadata = {"status": "skipped", "reason": "disabled" if not enable_stem_separation else "not_requested"}
    if _is_stem_separation_requested(tags, tweaks, analysis_before, enable_stem_separation=enable_stem_separation):
        # Opt-in vocal/accompaniment stem path (unchanged behaviour): it
        # prepares a re-balanced pre-master; the plan-driven chain below
        # then masters that pre-master.
        try:
            vocals, accompaniment, stem_metadata = _separate_vocal_stems(input_path)
            processed_vocals, vocal_processing = _process_vocal_stem(vocals, sr, processing_params)
            vocal_auto_db = _section_gain_db_envelope(
                total_samples=processed_vocals.shape[0],
                sr=sr,
                section_info=section_info,
                gains_db={"chorus": 0.30, "bridge": 0.15, "final_chorus": 0.36},
                ramp_s=0.65,
            )
            processed_vocals *= _db_to_lin(vocal_auto_db)[:, np.newaxis]
            vocal_reverb_send_db = _section_gain_db_envelope(
                total_samples=processed_vocals.shape[0],
                sr=sr,
                section_info=section_info,
                gains_db={"chorus": -26.0, "bridge": -28.0, "final_chorus": -24.5},
                ramp_s=0.65,
            )
            vocal_reverb_send = np.clip(_db_to_lin(vocal_reverb_send_db), 0.0, 0.09)
            reverb_fx = Pedalboard([Reverb(room_size=0.52, damping=0.38, width=1.0, wet_level=1.0, dry_level=0.0)])
            vocal_wet = np.asarray(reverb_fx(np.ascontiguousarray(processed_vocals.T, dtype=np.float32), sr).T, dtype=np.float32)
            processed_vocals = np.clip(processed_vocals + (vocal_wet * vocal_reverb_send[:, np.newaxis]), -1.0, 1.0)
            processed_music, music_processing = _process_accompaniment_stem(accompaniment, sr, processing_params)
            premaster_audio = np.clip(processed_music + processed_vocals, -1.0, 1.0).astype(np.float32)
            stem_metadata.update(
                {
                    "vocal_processing": vocal_processing,
                    "music_processing": music_processing,
                    "automation": {
                        "vocal_gain_db": {"chorus": 0.30, "bridge": 0.15, "final_chorus": 0.36},
                        "vocal_reverb_send_db": {"chorus": -26.0, "bridge": -28.0, "final_chorus": -24.5},
                    },
                }
            )
        except Exception as exc:
            stem_metadata = {"status": "unavailable", "reason": str(exc)[:300]}

    # --- render, evaluate, (at most one) backoff -----------------------------
    initial_plan_dict = plan.to_dict()
    render, analysis_after, evaluation = _render_and_evaluate(premaster_audio, sr, plan, profile, analysis_before, context)
    initial_evaluation = evaluation
    backoff_info = {"applied": False, "attempted": False}
    renders = 1
    if not evaluation.passed and renders <= C.MAX_BACKOFF_RENDERS:
        backoff_plan, actions = derive_backoff_plan(plan, evaluation)
        if backoff_plan is not None:
            renders += 1
            b_render, b_after, b_eval = _render_and_evaluate(premaster_audio, sr, backoff_plan, profile, analysis_before, context)
            keep = b_eval.collateral_score < evaluation.collateral_score or (b_eval.passed and not evaluation.passed)
            backoff_info = {
                "attempted": True,
                "applied": bool(keep),
                "actions": actions,
                "initial_collateral_score": evaluation.collateral_score,
                "backoff_collateral_score": b_eval.collateral_score,
                "reason": "backoff render evaluated better" if keep else "backoff render did not evaluate better; kept the initial render",
            }
            if keep:
                plan, render, analysis_after, evaluation = backoff_plan, b_render, b_after, b_eval

    stereo_processed = render["audio"]
    limiter_report = render["limiter_report"]
    loudness_guard = render["loudness_guard"]
    lufs_gain_db = render["lufs_gain_db"]

    # Keep the reported legacy parameter view in sync with the plan that
    # actually produced the final audio.
    if backoff_info.get("applied"):
        from .mastering_params import legacy_params_from_plan

        refreshed = legacy_params_from_plan(
            plan, context, profile, processing_params["_problems"], analysis_before,
            genre, list(tags or []), style, category, flavour, context.reference_used,
        )
        refreshed["user_tweaks"] = processing_params.get("user_tweaks", {})
        refreshed["tweak_summary"] = processing_params.get("tweak_summary", {})
        processing_params = refreshed

    ev = evaluation.to_dict()
    transient_qc = dict(ev["transients"])
    transient_qc["corrective_action"] = (
        {"attempted": True, "applied": backoff_info["applied"], "reduced": "; ".join(backoff_info.get("actions", []))}
        if backoff_info.get("attempted") and any(f["kind"] == "transient_loss" for f in initial_evaluation.flags)
        else None
    )

    # Final quality control — measured on the rendered signal. Corrective
    # action here stays deliberately narrow (channel balance, DC offset).
    quality_control = run_quality_control(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        mastered_audio=stereo_processed,
        processing_params=processing_params,
        limiter_report=limiter_report,
    )
    qc_corrections = []
    non_passing_ids = {c["id"] for c in quality_control["checks"] if c["status"] != "pass"}
    if "channel_balance" in non_passing_ids:
        stereo_processed = rebalance_channels(stereo_processed)
        qc_corrections.append("channel_balance: rebalanced L/R to the quieter channel's level")
    if "dc_offset" in non_passing_ids:
        stereo_processed = stereo_processed - np.mean(stereo_processed, axis=0, keepdims=True).astype(np.float32)
        qc_corrections.append("dc_offset: removed residual DC offset from the final render")
    if qc_corrections:
        analysis_after = _analysis_from_audio(stereo_processed, sr)
        quality_control = run_quality_control(
            analysis_before=analysis_before,
            analysis_after=analysis_after,
            mastered_audio=stereo_processed,
            processing_params=processing_params,
            limiter_report=limiter_report,
        )
    quality_control["corrections_applied"] = qc_corrections

    sf.write(str(output_path), stereo_processed, sr, subtype="PCM_24")

    diagnostics = {
        "engine": "adaptive_plan_v2",
        "source_profile": analysis_before["source_profile"],
        "detected_problems": plan.detected_problems,
        "mastering_plan": plan.to_dict(),
        "initial_plan": initial_plan_dict if backoff_info.get("applied") else None,
        "render": render["report"],
        "evaluation": ev,
        "initial_evaluation": initial_evaluation.to_dict() if backoff_info.get("attempted") else None,
        "backoff_applied": bool(backoff_info.get("applied")),
        "backoff": backoff_info,
        "renders": renders,
    }

    public = public_params(processing_params)
    band_names = ("sub", "punch", "low_mid", "high_mid", "high") if tier == "professional" else ("low", "low_mid", "high_mid", "high")
    processing_applied = {
        "spectral_match_source": public.get("spectral_match_source", "genre_profile"),
        "spectral_tilt": {
            "target_db_per_octave": public.get("target_spectral_tilt_db_per_octave"),
            "measured_before_db_per_octave": public.get("measured_spectral_tilt_db_per_octave"),
            "measured_after_db_per_octave": analysis_after["source_profile"]["spectral_tilt"],
        },
        "per_band_gain_changes_db": public["per_band_gain_changes_db"],
        "eq_decisions": plan.to_dict()["eq_decisions"],
        "compression_enabled": bool(plan.compression.get("enabled")),
        "compression_per_band": {
            name: {
                "ratio": round(float(public["band_compression_ratio"][name]), 3),
                "threshold_db": round(float(public["band_threshold_db"][name]), 3),
                "attack_ms": round(float(public["band_attack_ms"][name]), 1),
                "release_ms": round(float(public["band_release_ms"][name]), 1),
                "max_gain_reduction_db": round(float(public["band_max_gain_reduction_db"][name]), 2),
                "dynamic_eq_max_reduction_db": 0.0,
            }
            for name in band_names
        },
        "dynamic_eq": plan.to_dict()["dynamic_eq_decisions"],
        "tier": tier,
        "deesser_strength": round(float(public.get("deesser_strength", 0.0)), 3),
        "saturation_amount": round(float(public["saturation_amount"]), 4),
        "width_adjustment": round(float(public["side_gain"]), 4),
        "low_band_stereo_keep": public["low_band_stereo_keep"],
        "mono_below_hz": plan.stereo.get("lf_mono", {}).get("cutoff_hz") if plan.stereo.get("lf_mono", {}).get("enabled") else None,
        "dynamics_recovery_mix": 0.0,
        "lufs_change": f"{analysis_before['integrated_lufs']:.2f} -> {analysis_after['integrated_lufs']:.2f}",
        "lufs_gain_applied_db": round(float(lufs_gain_db), 3),
        "loudness_range": public.get("loudness_range"),
        "limiter": limiter_report,
        "loudness_guard": loudness_guard,
        "mono_compatibility_action": "lf_mono" if plan.stereo.get("lf_mono", {}).get("enabled") else "none",
        "section_detection": section_info,
        "section_automation": None,  # fixed chorus width/air automation removed: not source-justified
        "user_tweaks": public.get("user_tweaks", {}),
        "tweak_summary": public.get("tweak_summary", {}),
        "category": public.get("category"),
        "flavour": public.get("flavour"),
        "category_tweak_bias": public.get("category_tweak_bias", {}),
        "stem_separation": stem_metadata,
        "reference_track": reference_info,
        "input_validation": input_validation,
        "quality_control_corrections": quality_control.get("corrections_applied", []),
        "band_diagnosis": public.get("band_diagnosis", {}),
        "vocal_presence_disabled_reason": public.get("vocal_presence_disabled_reason"),
        "mix_diagnosis": public.get("mix_diagnosis", []),
        "post_render_overshoot_corrections": [],
        "transient_qc": transient_qc,
        "mastering_diagnostics": diagnostics,
    }

    source_warnings = []
    if analysis_before.get("near_mono_source"):
        source_warnings.append(
            "Source file has little to no stereo content (left/right channels are nearly identical) — "
            "mastering can't create real stereo separation that was never in the recording. "
            "The width/wider controls have nothing to widen here."
        )
    for issue in public.get("mix_diagnosis", []):
        if issue["issue"] == "overly_narrow_stereo" and analysis_before.get("near_mono_source"):
            continue
        source_warnings.append(f"Mix note ({issue['issue']}): {issue['detail']}")

    ab_analysis = build_ab_report(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        processing_params=public,
        limiter_report=limiter_report,
        quality_control=quality_control,
        transient_qc=transient_qc,
    )
    if not ab_analysis["improved"]:
        source_warnings = source_warnings + [f"Improvement check: {reason}" for reason in ab_analysis["verdict_reasons"]]

    decision_report = build_decision_report(public, limiter_report, [], transient_qc, plan=plan.to_dict(), evaluation=ev, backoff=backoff_info)

    # Absolute-level guardrails (7-ish bands, see band_levels.py) — kept as
    # an independent cross-check of the evaluation above.
    try:
        guardrail_deltas = loudness_matched_band_deltas(
            source_audio=audio_stereo,
            rendered_audio=stereo_processed,
            sr=sr,
            source_lufs=float(analysis_before["integrated_lufs"]),
            rendered_lufs=float(analysis_after["integrated_lufs"]),
        )
        guardrail_result = validate_render(
            band_deltas_db=guardrail_deltas,
            true_peak_dbtp=float(analysis_after["true_peak_db"]),
            rendered_lufs=float(analysis_after["integrated_lufs"]),
            target_lufs=float(plan.loudness["target_lufs"]),
            transient_delta=float(transient_qc["delta"]),
        )
        level_diagnostics = {
            "status": "ok",
            "method": "STFT n_fft=4096 hop=1024, mean gated frame power per band, dB; render gain-matched to source LUFS",
            "input_band_levels_db": {k: round(v, 2) for k, v in band_levels_db(audio_stereo, sr).items()},
            "output_band_levels_db": {k: round(v, 2) for k, v in band_levels_db(stereo_processed, sr).items()},
            "loudness_matched_band_deltas_db": guardrail_deltas,
            "guardrails": guardrail_result.as_dict(),
            "stages_to_reduce_if_rerendering": guardrail_result.blamed_stages(),
        }
    except Exception as exc:  # never let diagnostics break a real render
        level_diagnostics = {"status": "unavailable", "reason": str(exc)[:300]}

    return {
        "analysis_before": analysis_before,
        "analysis_after": analysis_after,
        "level_diagnostics": level_diagnostics,
        "processing_applied": processing_applied,
        "mastering_diagnostics": diagnostics,
        "ab_gain_match": _ab_gain_match(analysis_before["integrated_lufs"], analysis_after["integrated_lufs"]),
        "ab_analysis": ab_analysis,
        "decision_report": decision_report,
        "quality_control": quality_control,
        "source_warnings": source_warnings,
        "target_profile_used": {
            "genre": genre,
            "style": style,
            "category": category,
            "flavour": flavour if category else None,
            "target_lufs": float(plan.loudness["target_lufs"]),
            "loudness_range": {k: plan.loudness[k] for k in ("preferred_lufs", "acceptable_min_lufs", "acceptable_max_lufs")},
            "target_dynamic_range_db": float(context.target_crest_db),
            "target_width": float(public["target_width"]),
        },
    }
