from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from .ab_analysis import build_ab_report, build_decision_report
from .analysis.profile import SourceProfile
from .audio_utils import (
    EPS,
    MASTER_SR,
    _db,
    resolve_master_sr,
    _ab_gain_match,
    _analysis_from_audio,
    _load_audio,
    reference_dynamics,
    reference_spectrum_only,
)
from .band_levels import band_levels_db
from .analysis.loudness import FastMeter
from .evaluation.backoff import derive_corrective_plan, derive_transparent_plan
from .evaluation.distortion import added_distortion_db
from .evaluation.evaluate import MasterEvaluation, evaluate_master
from .evaluation.verdict import MasterVerdict, build_verdict
from .engines import get_engine
from .mastering_params import _apply_user_tweaks, compute_processing_params, legacy_params_from_plan, public_params
from .output_validation import GuardrailConfig, ValidationResult, validate_render
from .planning.plan import MasteringPlan
from .planning import config as C
from .processing.eq import apply_eq
from .processing.render import render_plan
from .quality_control import (
    CHANNEL_IMBALANCE_ADDED_TOLERANCE_DB,
    CHANNEL_IMBALANCE_WARN_DB,
    DC_OFFSET_THRESHOLD_DB,
    InvalidAudioError,
    lr_balance_db,
    rebalance_channels,
    run_quality_control,
    validate_input_signal,
)
from .section_detection import _db_to_lin, _detect_song_sections, _section_gain_db_envelope
from .stem_decisions import measure_vocal_relationship, plan_stem_moves
from .stem_separation import _is_stem_separation_requested, _process_accompaniment_stem, _process_vocal_stem, _separate_vocal_stems

# Peak the stem pre-master sum is scaled down to (about -1 dBFS) when the
# recombined stems would otherwise exceed it.
_STEM_PREMASTER_PEAK = 0.891

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
    preset_intent: dict | None = None,
    delivery: str | None = None,
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
        preset_intent=preset_intent,
        delivery=delivery,
    )
    # Category/flavour tweak_bias is NOT merged into the sliders any more:
    # it shifts the target context (see planning/target_model.py), so it
    # can only move the destination, never force an EQ move by itself.
    return public_params(_apply_user_tweaks(processing_params, analysis, tweaks or {}))


@dataclass(frozen=True)
class Candidate:
    """One complete, self-consistent render attempt. Every reported field of
    a delivered master (plan, params, QC, evaluation, guardrails, limiter
    report, transient QC, verdict) is read from the ONE candidate that was
    delivered — never re-assembled from several attempts."""

    label: str
    plan: MasteringPlan
    processing_params: dict
    render: dict
    audio: np.ndarray
    analysis_after: dict
    evaluation: MasterEvaluation
    quality_control: dict
    guardrails: ValidationResult
    guardrail_deltas_db: dict
    planned_guardrail_deltas_db: dict
    verdict: MasterVerdict
    distortion: dict
    actions: tuple = ()


class _GuardrailReference:
    """Source-side guardrail measurements, computed once per job: the
    premaster's band levels and loudness. Each candidate's render, and its
    plan's EQ-only prediction, are measured against these at the premaster's
    loudness, on exactly the same basis."""

    def __init__(self, premaster: np.ndarray, sr: int):
        self.audio = premaster
        self.sr = sr
        self.meter = FastMeter(sr)
        self.lufs = self._lufs(premaster)
        self.levels = band_levels_db(premaster, sr)
        self.lr_balance_db = lr_balance_db(premaster)
        self._eq_cache: dict = {}

    def _lufs(self, x: np.ndarray) -> float:
        try:
            v = float(self.meter.integrated_loudness(x))
        except Exception:
            v = -70.0
        return v if np.isfinite(v) else -70.0

    def matched_deltas(self, audio: np.ndarray) -> dict:
        gain_db = float(np.clip(self.lufs - self._lufs(audio), -24.0, 24.0))
        matched = np.asarray(audio, dtype=np.float32) * (10.0 ** (gain_db / 20.0))
        after = band_levels_db(matched, self.sr)
        return {k: round(float(after[k] - self.levels[k]), 3) for k in self.levels}

    def eq_deltas(self, decisions: list) -> dict:
        """What the planned static EQ alone does to the guardrail bands."""
        active = [d for d in decisions if abs(float(d.gain_db)) > 1e-3]
        if not active:
            return {k: 0.0 for k in self.levels}
        key = tuple((d.filter_type, round(float(d.frequency_hz), 3), round(float(d.gain_db), 4), round(float(d.q), 4)) for d in active)
        if key not in self._eq_cache:
            self._eq_cache[key] = self.matched_deltas(apply_eq(self.audio, active, self.sr))
        return self._eq_cache[key]


def _integrity_corrections(audio: np.ndarray, source_lr_balance_db: float) -> tuple[np.ndarray, list[str]]:
    """The two narrow corrections final QC used to apply AFTER evaluation
    (channel balance, residual DC) — applied before any measurement now, so
    every number reported describes the audio actually delivered. Channel
    balance is only corrected when PROCESSING moved it away from the
    source's own balance, and is restored to that balance (not to 0 dB)."""
    corrections = []
    balance = lr_balance_db(audio)
    if abs(balance) > CHANNEL_IMBALANCE_WARN_DB and abs(balance - source_lr_balance_db) > CHANNEL_IMBALANCE_ADDED_TOLERANCE_DB:
        audio = rebalance_channels(audio, source_lr_balance_db)
        corrections.append(f"channel_balance: L/R restored from {balance:+.1f} dB to the source's {source_lr_balance_db:+.1f} dB")
    dc = np.mean(audio, axis=0)
    if any(abs(float(v)) > EPS and _db(abs(float(v))) > DC_OFFSET_THRESHOLD_DB for v in dc):
        audio = (audio - dc[np.newaxis, :]).astype(np.float32)
        corrections.append("dc_offset: removed residual DC offset from the final render")
    return audio, corrections


def _build_candidate(label, premaster_audio, sr, plan, processing_params, profile, analysis_before, context, reference: _GuardrailReference, requested_target_lufs, actions=()) -> Candidate:
    render = render_plan(premaster_audio, sr, plan)
    audio = render["audio"]
    # Absolute output safety, independent of any adaptive decision: never
    # hand back a full-scale sample.
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak >= 0.999:
        audio = (audio * (0.999 / peak)).astype(np.float32)
        render["report"]["final_sample_peak_trim_db"] = round(20.0 * np.log10(0.999 / peak), 3)
    audio, corrections = _integrity_corrections(audio, reference.lr_balance_db)
    render["audio"] = audio

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
    ceiling = float(plan.limiter["ceiling_dbtp"])
    quality_control = run_quality_control(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        mastered_audio=audio,
        processing_params=processing_params,
        limiter_report=render["limiter_report"],
        true_peak_ceiling_db=ceiling,
        source_lr_balance_db=reference.lr_balance_db,
    )
    quality_control["corrections_applied"] = corrections

    # The loudness guardrail checks the render against the target THIS plan
    # could reach inside its limiter budget; the gap to what was requested
    # is reported by the verdict, not hidden.
    effective_target = float(render["report"].get("bus", {}).get("budget_capped_target_lufs", plan.loudness["target_lufs"]))
    deltas = reference.matched_deltas(audio)
    planned = reference.eq_deltas(plan.eq_decisions)
    user = reference.eq_deltas([d for d in plan.eq_decisions if d.source != "automatic"])
    guardrails = validate_render(
        band_deltas_db=deltas,
        true_peak_dbtp=float(analysis_after["true_peak_db"]),
        rendered_lufs=float(analysis_after["integrated_lufs"]),
        target_lufs=effective_target,
        transient_delta=float(evaluation.transients["delta"]),
        config=GuardrailConfig(max_true_peak_dbtp=ceiling + C.TRUE_PEAK_TOLERANCE_DB),
        planned_deltas_db=planned,
        user_deltas_db=user,
    )
    distortion = added_distortion_db(reference.audio, audio, sr)
    distortion["blamed_stage"] = "saturation" if plan.saturation.get("enabled") else "bus"
    verdict = build_verdict(evaluation, quality_control, guardrails, requested_target_lufs=requested_target_lufs, effective_target_lufs=effective_target, distortion=distortion)
    return Candidate(
        label=label,
        plan=plan,
        processing_params=processing_params,
        render=render,
        audio=audio,
        analysis_after=analysis_after,
        evaluation=evaluation,
        quality_control=quality_control,
        guardrails=guardrails,
        guardrail_deltas_db=deltas,
        planned_guardrail_deltas_db=planned,
        verdict=verdict,
        distortion=distortion,
        actions=tuple(actions),
    )


def _vocal_enhancement_status(requested: bool, stem_metadata: dict) -> str:
    """not_requested | failed | unchanged (measured, nothing needed) | applied"""
    if not requested:
        return "not_requested"
    if stem_metadata.get("status") != "applied":
        return "failed"
    v = stem_metadata.get("vocal_processing", {})
    a = stem_metadata.get("music_processing", {})
    rides = any(abs(float(g)) > 1e-6 for g in stem_metadata.get("decisions", {}).get("section_vocal_gain_db", {}).values())
    return "unchanged" if v.get("unchanged") and a.get("unchanged") and not rides else "applied"


def _candidate_summary(c: Candidate) -> dict:
    return {
        "label": c.label,
        "passed": c.verdict.passed,
        "failures": [f"{f.source}:{f.kind}" for f in c.verdict.failures],
        "integrated_lufs": round(float(c.analysis_after["integrated_lufs"]), 2),
        "target_lufs": float(c.plan.loudness["target_lufs"]),
        "collateral_score": c.evaluation.collateral_score,
        "added_distortion_db": c.distortion.get("worst_db"),
        "actions": list(c.actions),
    }


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
    preset_intent: dict | None = None,
    delivery: str | None = None,
) -> dict:
    """SOURCE -> high-resolution analysis -> SourceProfile -> problem
    detection -> confidence -> budgets -> target context -> MasteringPlan
    -> candidate render -> evaluation + QC + guardrails (one MasterVerdict)
    -> stage-attributed corrective candidates / transparent fallback, all
    inside one render budget -> the first passing candidate is written.
    If no candidate passes, InvalidAudioError and no file.

    Every decision and its reason is returned under
    processing_applied["mastering_diagnostics"]."""
    # Render AT the source's own rate when it is one we deliver natively
    # (see resolve_master_sr). Previously every job was forced to 44.1 kHz,
    # so a 48 kHz mix came back resampled — a quality loss nobody asked
    # for, and the wrong delivery spec for anything going to picture.
    #
    # Stem separation runs at this same rate: Demucs works at 44.1 kHz
    # internally and its stems are resampled back to `sr` on load
    # (stem_separation._load_stems), so stems, sections and the pre-master
    # all share one clock.
    try:
        _probe_sr = int(sf.info(str(input_path)).samplerate)
    except Exception:
        _probe_sr = MASTER_SR
    render_sr = resolve_master_sr(_probe_sr)
    audio_stereo, sr = _load_audio(input_path, sr=render_sr)

    # Input validation — signal integrity before anything else touches the
    # audio. Raises InvalidAudioError for unusable input; DC offset is
    # corrected here so every downstream measurement sees the clean signal.
    input_validation = validate_input_signal(audio_stereo, sr)
    audio_stereo = input_validation.pop("_corrected_audio")

    analysis_before = _analysis_from_audio(audio_stereo, sr)

    reference_relative_db = None
    reference_dyn = None
    reference_info = {"used": False}
    if reference_track_path:
        # The reference is CONTEXT, never a copy: its spectral shape moves
        # the tonal target part of the way (bass shift capped), and its
        # loudness / crest / width pull the genre's targets part of the way
        # inside bounds (planning/target_model.py). Its transient character
        # is not used: the limiter budget stays this source's own.
        reference_audio, reference_sr = _load_audio(reference_track_path, sr=MASTER_SR)
        ref = reference_spectrum_only(reference_audio, reference_sr)
        reference_relative_db = ref["relative_db"]
        reference_dyn = reference_dynamics(reference_audio, reference_sr)
        reference_info = {"used": True, "spectral_balance": ref["legacy_shares"], "relative_spectrum_db": ref["relative_db"], "dynamics": reference_dyn}

    processing_params = compute_processing_params(
        analysis_before,
        genre=genre,
        tags=tags,
        style=style,
        category=category,
        flavour=flavour,
        tier=tier,
        reference_relative_db=reference_relative_db,
        preset_intent=preset_intent,
        delivery=delivery,
        reference_dynamics=reference_dyn,
    )
    processing_params = _apply_user_tweaks(processing_params, analysis_before, tweaks or {})
    plan = processing_params["_plan"]
    context = processing_params["_context"]
    profile = processing_params["_profile"]
    if reference_info.get("used"):
        reference_info["mode"] = "tonal_and_dynamics_context"
        reference_info["context_changes"] = (context.reference_dynamics or {}).get("changes", {})

    section_info = _detect_song_sections(audio_stereo, sr)
    premaster_audio = audio_stereo
    stem_metadata = {"status": "skipped", "reason": "disabled" if not enable_stem_separation else "not_requested"}
    stems_requested = _is_stem_separation_requested(tags, tweaks, analysis_before, enable_stem_separation=enable_stem_separation)
    if stems_requested:
        # Opt-in vocal/accompaniment stem path (unchanged behaviour): it
        # prepares a re-balanced pre-master; the plan-driven chain below
        # then masters that pre-master.
        try:
            vocals, accompaniment, stem_metadata = _separate_vocal_stems(input_path, sr=sr, n_samples=audio_stereo.shape[0])
            # Measure first, then decide: section vocal rides, arrangement
            # space and vocal-chain moves happen only where the vocal
            # measurably doesn't sit right (stem_decisions.py). No moves ->
            # the stems recombine to the original mix.
            vocal_measurements = measure_vocal_relationship(vocals, accompaniment, sr, section_info)
            moves = plan_stem_moves(vocal_measurements, processing_params)
            processed_vocals, vocal_processing = _process_vocal_stem(vocals, sr, moves)
            if any(abs(v) > 1e-6 for v in moves["section_vocal_gain_db"].values()):
                vocal_auto_db = _section_gain_db_envelope(
                    total_samples=processed_vocals.shape[0],
                    sr=sr,
                    section_info=section_info,
                    gains_db=moves["section_vocal_gain_db"],
                    ramp_s=0.65,
                )
                processed_vocals = processed_vocals * _db_to_lin(vocal_auto_db)[:, np.newaxis]
            processed_music, music_processing = _process_accompaniment_stem(accompaniment, sr, moves)
            # Float gain staging, no sample clipping before the mastering
            # limiter: the sum may exceed 0 dBFS here, so it is scaled as a
            # whole to keep headroom, and the limiter downstream does the
            # peak control it is designed (and measured) for.
            n = min(processed_music.shape[0], processed_vocals.shape[0])
            premaster_audio = (processed_music[:n] + processed_vocals[:n]).astype(np.float32)
            stem_peak = float(np.max(np.abs(premaster_audio))) if premaster_audio.size else 0.0
            if stem_peak > _STEM_PREMASTER_PEAK:
                premaster_audio = (premaster_audio * (_STEM_PREMASTER_PEAK / stem_peak)).astype(np.float32)
            stem_metadata.update(
                {
                    "vocal_measurements": vocal_measurements,
                    "decisions": moves,
                    "vocal_processing": vocal_processing,
                    "music_processing": music_processing,
                }
            )
        except Exception as exc:
            stem_metadata = {"status": "unavailable", "reason": str(exc)[:300]}

    # --- candidates: render -> evaluate -> one verdict -> correct -------------
    # Analyze -> Plan -> Render candidate -> Evaluate + QC + guardrails (one
    # MasterVerdict) -> attribute failures -> reduce the responsible stages
    # -> render the next candidate ... -> deliver the first candidate whose
    # verdict passes. Bounded by C.MAX_CANDIDATE_RENDERS in total. Nothing
    # is written to disk until a candidate has passed every check.
    initial_plan_dict = plan.to_dict()
    requested_target = float(plan.loudness["target_lufs"])
    reference = _GuardrailReference(premaster_audio, sr)
    base_params = processing_params

    def params_for(candidate_plan: MasteringPlan) -> dict:
        refreshed = legacy_params_from_plan(
            candidate_plan, context, profile, base_params["_problems"], analysis_before,
            genre, list(tags or []), style, category, flavour, context.reference_used,
        )
        refreshed["user_tweaks"] = base_params.get("user_tweaks", {})
        refreshed["tweak_summary"] = base_params.get("tweak_summary", {})
        return refreshed

    def build(label: str, candidate_plan: MasteringPlan, params: dict, actions=()) -> Candidate:
        return _build_candidate(label, premaster_audio, sr, candidate_plan, params, profile, analysis_before, context, reference, requested_target, actions)

    candidates = [build("initial", plan, base_params)]
    while not candidates[-1].verdict.passed and len(candidates) < 1 + C.MAX_CORRECTIVE_RENDERS:
        last = candidates[-1]
        next_plan, actions = derive_corrective_plan(last.plan, last.verdict, last.evaluation)
        if next_plan is None:
            break
        candidates.append(build(f"corrective_{len(candidates)}", next_plan, params_for(next_plan), actions))
    if not candidates[-1].verdict.passed and len(candidates) < C.MAX_CANDIDATE_RENDERS and any(c.verdict.correctable for c in candidates):
        last = candidates[-1]
        fallback_plan, actions = derive_transparent_plan(last.plan, last.verdict, last.evaluation)
        candidates.append(build("transparent_fallback", fallback_plan, params_for(fallback_plan), actions))

    # The first passing candidate is the one closest to the original plan:
    # every later candidate only removed processing.
    final = next((c for c in candidates if c.verdict.passed), None)
    if final is None:
        failed = sorted({f"{f.source}:{f.kind}" for f in candidates[-1].verdict.failures})
        raise InvalidAudioError(f"No mastering candidate passed final verification ({', '.join(failed)}); no master was delivered.")
    initial = candidates[0]
    renders = len(candidates)

    plan = final.plan
    processing_params = final.processing_params
    render = final.render
    analysis_after = final.analysis_after
    evaluation = final.evaluation
    quality_control = final.quality_control
    stereo_processed = final.audio
    limiter_report = render["limiter_report"]
    loudness_guard = render["loudness_guard"]
    lufs_gain_db = render["lufs_gain_db"]
    ev = evaluation.to_dict()

    recovered = final is not initial
    backoff_info = {
        "attempted": renders > 1,
        "applied": recovered,
        "actions": [a for c in candidates[1 : candidates.index(final) + 1] for a in c.actions],
        "initial_collateral_score": initial.evaluation.collateral_score,
        "final_collateral_score": evaluation.collateral_score,
        "reason": (
            f"initial render failed verification ({', '.join(f.kind for f in initial.verdict.failures)}); delivered '{final.label}'"
            if recovered
            else "initial render passed verification"
        ),
    }
    transient_qc = dict(ev["transients"])
    transient_qc["corrective_action"] = (
        {"attempted": True, "applied": True, "reduced": "; ".join(backoff_info["actions"])}
        if recovered and any(f.domain in ("transients", "dynamics") for f in initial.verdict.failures)
        else None
    )

    sf.write(str(output_path), stereo_processed, sr, subtype="PCM_24")

    diagnostics = {
        "engine": "adaptive_plan_v2",
        "source_profile": analysis_before["source_profile"],
        "detected_problems": plan.detected_problems,
        "mastering_plan": plan.to_dict(),
        "initial_plan": initial_plan_dict if recovered else None,
        "render": render["report"],
        "evaluation": ev,
        "initial_evaluation": initial.evaluation.to_dict() if renders > 1 else None,
        "verdict": final.verdict.to_dict(),
        "added_distortion": final.distortion,
        "initial_verdict": initial.verdict.to_dict() if renders > 1 else None,
        "candidates": [_candidate_summary(c) for c in candidates],
        "delivered_candidate": final.label,
        "backoff_applied": recovered,
        "backoff": backoff_info,
        "renders": renders,
        "render_budget": C.MAX_CANDIDATE_RENDERS,
    }

    public = public_params(processing_params)
    engine = get_engine(tier)
    band_names = engine.compression_bands
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
        "engine": engine.describe(),
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
        # Which candidate shipped, surfaced at the top level (not only deep
        # in diagnostics) so the UI and telemetry can't miss a fallback.
        "delivery": {
            "candidate": final.label,
            "transparent_fallback": final.label == "transparent_fallback",
            "renders": renders,
            "initial_failures": [f"{f.source}:{f.kind}" for f in initial.verdict.failures],
            "loudness_shortfall_lu": final.verdict.loudness["shortfall_vs_requested_lu"],
            "vocal_enhancement": _vocal_enhancement_status(stems_requested, stem_metadata),
        },
        "mastering_diagnostics": diagnostics,
    }

    # Every warning carries a stable code + params next to its English text
    # (processing_applied.source_warning_codes) so the UI can localize it;
    # the text stays the source of truth for older clients and job records.
    source_warnings: list[str] = []
    warning_codes: list[dict] = []

    def warn(code: str, text: str, first: bool = False, **params) -> None:
        item = {"code": code, "params": params, "text": text}
        if first:
            source_warnings.insert(0, text)
            warning_codes.insert(0, item)
        else:
            source_warnings.append(text)
            warning_codes.append(item)

    if input_validation.get("silent_channel_restored"):
        channel = input_validation["silent_channel_restored"]
        warn(
            "silent_channel_restored",
            f"The {channel} channel of this file was silent, so it was mastered as mono "
            "(the other channel on both sides). If that isn't what you intended, check the export settings of your mix.",
            channel=channel,
        )
    if input_validation.get("dc_offset_corrected"):
        warn("dc_offset_corrected", "Your file had a DC offset (a constant shift away from zero); it was removed before mastering. Check your mix bus for a faulty plugin or converter.")
    if float(input_validation.get("channel_imbalance_db") or 0.0) > CHANNEL_IMBALANCE_WARN_DB and not input_validation.get("silent_channel_restored"):
        db = round(float(input_validation["channel_imbalance_db"]), 1)
        warn("channel_imbalance", f"Left and right channels differ in level by {db:.1f} dB in your upload. Mastering keeps your balance as it is; check it was intentional.", db=db)
    if analysis_before.get("near_mono_source"):
        warn(
            "near_mono_source",
            "Source file has little to no stereo content (left/right channels are nearly identical) — "
            "mastering can't create real stereo separation that was never in the recording. "
            "The width/wider controls have nothing to widen here.",
        )
    for issue in public.get("mix_diagnosis", []):
        if issue["issue"] == "overly_narrow_stereo" and analysis_before.get("near_mono_source"):
            continue
        warn(f"mix_note.{issue['issue']}", f"Mix note ({issue['issue']}): {issue['detail']}")

    vocal_status = _vocal_enhancement_status(stems_requested, stem_metadata)
    if vocal_status == "failed":
        # The user explicitly asked for vocal enhancement: a silent fallback
        # to the full-mix master would misrepresent what they got.
        warn(
            "vocal_enhancement_failed",
            "Vocal enhancement was requested but could not run (vocal/instrument separation failed), "
            "so this master was made from the full mix without it.",
            first=True,
        )
    elif vocal_status == "unchanged":
        warn("vocal_enhancement_unchanged", "Vocal enhancement: the vocal was measured and already sits correctly in the mix, so it was left unchanged.")

    if final.label == "transparent_fallback":
        kinds = ", ".join(sorted({f.kind for f in initial.verdict.failures}))
        warn(
            "transparent_fallback",
            "Minimal-processing master: every corrective version of the full master still failed verification "
            f"({kinds}), so this file is gain and limiting only "
            "(plus your own tweaks). It is safe, but it is not a full master of this mix.",
            first=True,
            kinds=kinds,
        )
    shortfall = float(final.verdict.loudness["shortfall_vs_requested_lu"])
    if shortfall > C.LOUDNESS_SHORTFALL_WARN_LU:
        delivered = round(float(final.verdict.loudness["integrated_lufs"]), 1)
        requested = round(float(final.verdict.loudness["requested_target_lufs"]), 1)
        warn(
            "loudness_held_back",
            f"Loudness held back: delivered {delivered:.1f} LUFS, {shortfall:.1f} LU below the "
            f"requested {requested:.1f} LUFS, to stay inside this mix's dynamics budget.",
            delivered=delivered,
            shortfall=round(shortfall, 1),
            requested=requested,
        )

    quieter_by = float(analysis_before["integrated_lufs"]) - float(analysis_after["integrated_lufs"])
    if quieter_by > 1.0:
        # A loud, already-mastered upload often comes back QUIETER. That is
        # the engine choosing peak safety over level, and it must say why
        # instead of leaving the user to assume the master is worse.
        reasons = []
        reason_codes = []
        src_tp = float(analysis_before.get("true_peak_db", -99.0))
        ceiling = float(plan.limiter["ceiling_dbtp"])
        if src_tp > ceiling:
            reasons.append(f"your upload peaks at {src_tp:+.1f} dBTP and delivery needs {ceiling:.0f} dBTP or lower")
            reason_codes.append({"code": "peaks", "params": {"peak": f"{src_tp:+.1f}", "ceiling": f"{ceiling:.0f}"}})
        if (profile.clipping or {}).get("detected"):
            reasons.append("it already contains clipped samples, so it was not limited harder (that would add distortion)")
            reason_codes.append({"code": "clipped", "params": {}})
        if float(analysis_before["integrated_lufs"]) > float(plan.loudness["acceptable_max_lufs"]):
            reasons.append(f"it is louder than this genre/delivery range (up to {plan.loudness['acceptable_max_lufs']:.1f} LUFS)")
            reason_codes.append({"code": "too_loud", "params": {"max": f"{plan.loudness['acceptable_max_lufs']:.1f}"}})
        warn(
            "quieter_than_upload",
            f"This master is {quieter_by:.1f} dB quieter than your upload"
            + (": " + "; ".join(reasons) + "." if reasons else ", to stay inside safe peak and dynamics limits.")
            + " Use Match levels to compare tone fairly.",
            first=True,
            db=f"{quieter_by:.1f}",
            reasons=reason_codes,
        )

    ab_analysis = build_ab_report(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        processing_params=public,
        limiter_report=limiter_report,
        quality_control=quality_control,
        transient_qc=transient_qc,
    )
    if not ab_analysis["improved"]:
        for reason in ab_analysis["verdict_reasons"]:
            # The reason itself is measurement prose from ab_analysis.py and
            # is shown as-is (English) under a localized prefix.
            warn("improvement_check", f"Improvement check: {reason}", reason=reason)

    decision_report = build_decision_report(public, limiter_report, [], transient_qc, plan=plan.to_dict(), evaluation=ev, backoff=backoff_info)

    # The guardrails already gated delivery (they are part of the verdict);
    # this only reports what the delivered candidate measured.
    level_diagnostics = {
        "status": "ok",
        "method": "STFT n_fft=4096 hop=1024, mean gated frame power per band, dB; render gain-matched to the premaster's LUFS; planned = premaster through the plan's static EQ only",
        "input_band_levels_db": {k: round(v, 2) for k, v in reference.levels.items()},
        "output_band_levels_db": {k: round(v, 2) for k, v in band_levels_db(stereo_processed, sr).items()},
        "loudness_matched_band_deltas_db": final.guardrail_deltas_db,
        "planned_band_deltas_db": final.planned_guardrail_deltas_db,
        "guardrails": final.guardrails.as_dict(),
        "stages_to_reduce_if_rerendering": final.guardrails.blamed_stages(),
    }

    return {
        "analysis_before": analysis_before,
        "analysis_after": analysis_after,
        "level_diagnostics": level_diagnostics,
        "processing_applied": {**processing_applied, "source_warning_codes": warning_codes},
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
            "delivery": context.delivery,
            "true_peak_ceiling_dbtp": float(plan.limiter["ceiling_dbtp"]),
            "preset": context.preset,
            "loudness_range": {k: plan.loudness[k] for k in ("preferred_lufs", "acceptable_min_lufs", "acceptable_max_lufs")},
            "target_dynamic_range_db": float(context.target_crest_db),
            "target_width": float(public["target_width"]),
        },
    }
