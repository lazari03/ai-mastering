from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import HighShelfFilter, PeakFilter, Pedalboard, Reverb

from .ab_analysis import build_ab_report, build_decision_report
from .audio_utils import (
    MASTER_SR,
    _ab_gain_match,
    _analysis_from_audio,
    _load_audio,
    _loudness_range_only,
    _mono_compatibility_risk_only,
    _spectral_balance_only,
    _transient_metrics,
)
from .bus_processing import _bus_process, _bus_process_pro
from .dsp_filters import _build_stereo_from_ms, _deess, _lr4_highpass, _lr4_lowpass, _oversampled_distortion, _process_band, _split_bands, _split_bands_pro
from .mastering_params import _apply_user_tweaks, compute_processing_params
from .band_levels import band_levels_db, loudness_matched_band_deltas
from .output_validation import validate_render
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
    merged_tweaks = dict(tweaks or {})
    for tweak_key, tweak_delta in processing_params.get("category_tweak_bias", {}).items():
        merged_tweaks[tweak_key] = float(merged_tweaks.get(tweak_key, 0.0)) + float(tweak_delta)
    return _apply_user_tweaks(processing_params, analysis, merged_tweaks)


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
    is_pro = tier == "professional"
    split_fn = _split_bands_pro if is_pro else _split_bands
    bus_fn = _bus_process_pro if is_pro else _bus_process
    band_names = ("sub", "punch", "low_mid", "high_mid", "high") if is_pro else ("low", "low_mid", "high_mid", "high")

    audio_stereo, sr = _load_audio(input_path, sr=MASTER_SR)

    # Input validation — signal integrity before anything else touches the
    # audio (spec: "Input validation" is the first stage, before analysis).
    # Raises InvalidAudioError for genuinely unusable input (empty, NaN/Inf,
    # digital silence); DC offset is corrected here (a real, always-first
    # signal-integrity fix, not just a reported number) so every downstream
    # measurement — including analysis_before — reflects the corrected signal.
    input_validation = validate_input_signal(audio_stereo, sr)
    audio_stereo = input_validation.pop("_corrected_audio")

    analysis_before = _analysis_from_audio(audio_stereo, sr)

    reference_spectral_balance = None
    reference_info = {"used": False}
    if reference_track_path:
        # Only the reference's spectral shape is used (see
        # compute_processing_params) — its own loudness/dynamics don't leak
        # into this render, so a loud/hot reference can't accidentally
        # override the target LUFS logic above. Spectral-balance-only
        # analysis, not a full one — the reference's LUFS/tempo/true-peak
        # would just be measured and thrown away otherwise.
        reference_audio, reference_sr = _load_audio(reference_track_path, sr=MASTER_SR)
        reference_spectral_balance = _spectral_balance_only(reference_audio, reference_sr)
        reference_info = {"used": True, "spectral_balance": reference_spectral_balance}

    processing_params = compute_processing_params(
        analysis_before,
        genre=genre,
        tags=tags,
        style=style,
        reference_spectral_balance=reference_spectral_balance,
        category=category,
        flavour=flavour,
    )

    # A selected category/flavour expresses part of its bias as tweak-slider
    # deltas (see params.py:MASTERING_CATEGORY_PROFILES's tweak_bias field) —
    # merged additively with the user's own sliders here so both reuse the
    # same, already-adaptive _apply_user_tweaks logic instead of a second
    # per-band implementation. Values still get clamped to [-1, 1] there.
    merged_tweaks = dict(tweaks or {})
    for tweak_key, tweak_delta in processing_params.get("category_tweak_bias", {}).items():
        merged_tweaks[tweak_key] = float(merged_tweaks.get(tweak_key, 0.0)) + float(tweak_delta)
    processing_params = _apply_user_tweaks(processing_params, analysis_before, merged_tweaks)

    section_info = _detect_song_sections(audio_stereo, sr)
    premaster_audio = audio_stereo
    stem_metadata = {"status": "skipped", "reason": "disabled" if not enable_stem_separation else "not_requested"}
    if _is_stem_separation_requested(tags, tweaks, analysis_before, enable_stem_separation=enable_stem_separation):
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

            # Extra section ambience on vocals (subtle and only in highlighted sections).
            vocal_reverb_send_db = _section_gain_db_envelope(
                total_samples=processed_vocals.shape[0],
                sr=sr,
                section_info=section_info,
                gains_db={"chorus": -26.0, "bridge": -28.0, "final_chorus": -24.5},
                ramp_s=0.65,
            )
            vocal_reverb_send = np.clip(_db_to_lin(vocal_reverb_send_db), 0.0, 0.09)
            reverb_fx = Pedalboard([
                Reverb(room_size=0.52, damping=0.38, width=1.0, wet_level=1.0, dry_level=0.0),
            ])
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

    left = premaster_audio[:, 0]
    right = premaster_audio[:, 1]
    mid = (left + right) * 0.5
    side = (left - right) * 0.5

    mid_bands = split_fn(mid, sr)
    side_bands = split_fn(side, sr)

    processed_mid_bands = {}
    processed_side_bands = {}
    for band_name in band_names:
        processed_mid_bands[band_name] = _process_band(mid_bands[band_name], sr, band_name, processing_params, "mid")
        processed_side_bands[band_name] = _process_band(side_bands[band_name], sr, band_name, processing_params, "side")

    mid_processed = sum(processed_mid_bands.values())
    side_processed = sum(processed_side_bands.values())

    # Sibilance/harshness control on the full mix's mid channel — before
    # saturation, so that stage's own harmonic generation doesn't add new
    # brightness on top of sibilance this hasn't tamed yet. Mid only (not
    # side): vocals sit centered in virtually every real mix, and running
    # this on side energy too would risk dulling genuinely wide, non-vocal
    # high-frequency content (cymbals, synths) that only exists off-center.
    mid_processed = _deess(mid_processed, sr, float(processing_params.get("deesser_strength", 0.0)))

    sat_drive_db = float(np.clip(processing_params["saturation_amount"] * 12.0, 0.0, 7.0))
    if sat_drive_db > 0.1:
        mid_processed = _oversampled_distortion(mid_processed, sr, sat_drive_db)
        side_processed = _oversampled_distortion(side_processed, sr, sat_drive_db * 0.2)

    # Hard low-frequency mono enforcement — standard mastering practice, not
    # just the soft low_band_stereo_keep ratio below (that only *narrows*
    # width down to 320Hz; this actually collapses side energy to ~0 below a
    # much lower cutoff, so true sub-bass can't phase-cancel on mono
    # playback systems — club/vinyl/broadcast/phone speakers). Pro tier
    # reuses its own sub/punch boundary (90Hz) since that's already a
    # meaningful split point in that tier; standard tier uses a slightly
    # higher default since it has no sub-band split of its own.
    mono_below_hz = 90.0 if is_pro else 120.0
    side_processed = _lr4_highpass(side_processed, mono_below_hz, sr)

    side_gain = float(processing_params["side_gain"])
    low_side_keep = float(np.clip(processing_params.get("low_band_stereo_keep", 0.93), 0.85, 1.0))
    low_side = _lr4_lowpass(side_processed, 320.0, sr)
    high_side = side_processed - low_side

    width_auto_db = _section_gain_db_envelope(
        total_samples=high_side.shape[0],
        sr=sr,
        section_info=section_info,
        gains_db={"chorus": 0.5, "bridge": 0.25, "final_chorus": 0.6},
        ramp_s=0.85,
    )
    width_auto_lin = _db_to_lin(width_auto_db)
    side_width_adjusted = (low_side * low_side_keep) + (high_side * side_gain * width_auto_lin)
    stereo_prebus = _build_stereo_from_ms(mid_processed, side_width_adjusted)

    # Section air automation on the final stereo field.
    air_auto_db = _section_gain_db_envelope(
        total_samples=stereo_prebus.shape[0],
        sr=sr,
        section_info=section_info,
        gains_db={"chorus": 0.2, "bridge": 0.1, "final_chorus": 0.24},
        ramp_s=0.85,
    )
    max_air_db = 0.25
    air_blend = np.clip(air_auto_db / max_air_db, 0.0, 1.0)
    air_boost_fx = Pedalboard([HighShelfFilter(cutoff_frequency_hz=12000.0, gain_db=max_air_db, q=0.7)])
    air_boosted = np.asarray(air_boost_fx(np.ascontiguousarray(stereo_prebus.T, dtype=np.float32), sr).T, dtype=np.float32)
    stereo_prebus = (stereo_prebus * (1.0 - air_blend[:, np.newaxis])) + (air_boosted * air_blend[:, np.newaxis])

    # Only mono_compatibility_risk and loudness_range_lu are needed here —
    # both computed directly rather than paying for a full _analysis_from_
    # audio (STFT, tempo detection, momentary/short-term LUFS series,
    # true-peak measurement) just to read two fields off it.
    prebus_mono_risk = _mono_compatibility_risk_only(stereo_prebus)
    pre_lra = _loudness_range_only(stereo_prebus, sr)
    mono_action = "none"
    if prebus_mono_risk and not analysis_before["mono_compatibility_risk"]:
        side_gain = 1.0 + (side_gain - 1.0) * 0.4
        side_width_adjusted = (low_side * low_side_keep) + (high_side * side_gain * width_auto_lin)
        stereo_prebus = _build_stereo_from_ms(mid_processed, side_width_adjusted)
        mono_action = "reduced_width_to_avoid_cancellation"

    stereo_processed, lufs_gain_db, loudness_guard, limiter_report = bus_fn(stereo_prebus, sr, processing_params)

    # Dynamic retention: blend in a touch of cleaner pre-master content when LRA gets over-flattened.
    post_lra = _loudness_range_only(stereo_processed, sr)
    lra_target_min = float(processing_params.get("lra_target_min_lu", 2.5))
    desired_min_lra = max(2.0, min(lra_target_min, float(analysis_before.get("loudness_range_lu", 2.0)) * 0.85))
    dynamics_recovery_mix = 0.0
    if post_lra < desired_min_lra:
        source_lra = float(analysis_before.get("loudness_range_lu", pre_lra))
        needed = min(desired_min_lra - post_lra, max(0.0, source_lra - post_lra))
        dynamics_recovery_mix = float(np.clip(needed / max(source_lra, 0.1), 0.08, 0.42))
        stereo_processed = (stereo_processed * (1.0 - dynamics_recovery_mix)) + (premaster_audio * dynamics_recovery_mix)
        # Re-apply finalization after the blend, at the SAME target_lufs as
        # the first pass — not capped down toward source loudness. That cap
        # used to live here ("avoid forcing loudness up when dynamics are
        # already narrow"), but it threw away most of the mastering gain
        # any time this path triggered, capping the whole render to barely
        # louder than the raw, unmastered source regardless of how far below
        # a commercial target that left it. The actual protection this was
        # reaching for — don't re-crush the dynamics this blend just
        # restored — now lives in bus_fn itself: its loudness-recovery step
        # (see _recover_undershot_loudness in bus_processing.py) won't push
        # gain past this genre/style's own target_dynamic_range_db crest
        # floor, so the blended-in dynamics can't be limited back down past
        # what this master is supposed to sound like, without abandoning the
        # loudness target outright.
        stereo_processed, lufs_gain_db, loudness_guard, limiter_report = bus_fn(
            stereo_processed,
            sr,
            processing_params,
            apply_glue_compression=False,
        )

    analysis_after = _analysis_from_audio(stereo_processed, sr)

    # ---------------------------------------------------------------------
    # Post-render spectral overshoot verification (mastering-philosophy
    # audit: "re-analyze the actual master, don't just assume parameters
    # produced the intended result"). The per-band corrections in
    # compute_processing_params are computed from the PRE-master analysis —
    # a prediction, not a guarantee, since multiband compression,
    # saturation, and the limiter all still touch the spectrum afterward.
    # This checks the three presence-region bands (the ones the HF/presence
    # budget above specifically governs) against the SAME target window
    # that decided their correction, using the actual rendered result:
    #   overshoot  — source was below target, master ended up above it
    #   regression — source was already above target, master pushed it
    #                further above
    # Either one gets exactly ONE conservative corrective trim (a gentle
    # static cut centered on the offending band), never an iterative loop —
    # spec: "maximum of 1-2 conservative corrective rerenders." This
    # corrects the finished signal directly (the same pattern the QC block
    # below already uses for channel-balance/DC-offset fixes) rather than
    # re-running the whole multiband chain, which keeps the correction's
    # blast radius to exactly the one band that actually overshot.
    # ---------------------------------------------------------------------
    target_balance_check = processing_params.get("target_spectral_balance", {})
    PRESENCE_VERIFY_BANDS = {
        "high_mid_2000_4000hz": 3000.0,
        "presence_4000_6000hz": 5000.0,
        "brilliance_6000_20000hz": 9000.0,
    }
    OVERSHOOT_TOLERANCE_DB = 1.0  # same magnitude as the upstream deadband — a difference this small isn't a real overshoot, it's measurement noise
    overshoot_corrections = []
    overshoot_fx_stages = []
    for band_key, center_hz in PRESENCE_VERIFY_BANDS.items():
        target_share = target_balance_check.get(band_key)
        if not target_share:
            continue
        before_share = max(float(analysis_before["spectral_balance"].get(band_key, 0.0)), 1e-6)
        after_share = max(float(analysis_after["spectral_balance"].get(band_key, 0.0)), 1e-6)
        before_delta_db = 20.0 * np.log10(before_share / target_share)
        after_delta_db = 20.0 * np.log10(after_share / target_share)

        kind = None
        if before_delta_db < -OVERSHOOT_TOLERANCE_DB and after_delta_db > OVERSHOOT_TOLERANCE_DB:
            kind = "overshoot"
        elif before_delta_db > OVERSHOOT_TOLERANCE_DB and after_delta_db > before_delta_db + OVERSHOOT_TOLERANCE_DB:
            kind = "regression"
        if kind is None:
            continue

        # Half the measured overshoot, bounded to a small, safe range — a
        # corrective trim, not a second attempt at hitting the target
        # exactly (that would just be chasing the number from the other
        # direction).
        trim_db = -float(np.clip(after_delta_db * 0.5, 0.3, 1.5))
        overshoot_fx_stages.append(PeakFilter(cutoff_frequency_hz=center_hz, gain_db=trim_db, q=0.9))
        overshoot_corrections.append(
            {"band": band_key, "kind": kind, "before_delta_db": round(before_delta_db, 2), "after_delta_db": round(after_delta_db, 2), "trim_applied_db": round(trim_db, 2)}
        )

    if overshoot_fx_stages:
        overshoot_fx = Pedalboard(overshoot_fx_stages)
        stereo_processed = np.asarray(
            overshoot_fx(np.ascontiguousarray(stereo_processed.T, dtype=np.float32), sr).T, dtype=np.float32
        )
        analysis_after = _analysis_from_audio(stereo_processed, sr)

    # ---------------------------------------------------------------------
    # Post-render transient QC (mastering-philosophy audit: "re-analyze the
    # actual master... do not treat the expected increase in RMS/loudness
    # as automatically better"). Loudness-matched — a louder master trips
    # the transient-metrics' onset detector more easily than a quieter one
    # with an identical attack SHAPE, so comparing raw scores would
    # conflate "got louder" with "kept its punch." Gain-matching the master
    # back down to the source's own integrated loudness before re-measuring
    # removes that bias (same gain-matched-comparison principle
    # ab_gain_match already applies for the UI's A/B player).
    # ---------------------------------------------------------------------
    gain_match_db = float(np.clip(analysis_before["integrated_lufs"] - analysis_after["integrated_lufs"], -24.0, 24.0))
    loudness_matched_master = stereo_processed * (10.0 ** (gain_match_db / 20.0))
    matched_transient_metrics = _transient_metrics(loudness_matched_master, sr)

    source_transient_score = float(analysis_before.get("drum_punch_estimate", 0.0))
    master_transient_score = float(matched_transient_metrics.get("drum_punch_estimate", 0.0))
    transient_score_delta = master_transient_score - source_transient_score

    transients_priority = float(processing_params.get("preservation_priorities", {}).get("transients", 0.75))
    # Allowed loss is NOT a universal fixed number — it shrinks as this
    # genre's own transient priority rises, so Rock/Metal (priority ~0.92)
    # get a much tighter leash (~0.08) than Podcast/House (priority ~0.35,
    # ~0.60) get (~0.17, ~0.13). A source with almost no punch to begin
    # with (source_transient_score < 0.15 — spoken word, ambient pads)
    # can't meaningfully "fail" this check for losing what it never had.
    allowed_transient_loss = float(np.clip(0.22 - transients_priority * 0.15, 0.04, 0.22))
    transient_qc_passed = bool(transient_score_delta >= -allowed_transient_loss or source_transient_score < 0.15)

    transient_corrective_action = None
    if not transient_qc_passed:
        # ONE conservative corrective pass (spec: "maximum of 1-2
        # corrective rerenders... avoid endless optimization loops"),
        # applied in the priority order the spec itself gives: reduce
        # unnecessary clipping first, then excessive limiting — both are
        # bus-stage decisions, so this re-runs bus_fn once on the already-
        # computed pre-bus signal (stereo_prebus), the exact same safe
        # re-invocation shape the dynamics-recovery blend above already
        # uses, rather than re-running the whole multiband EQ/compression
        # chain from scratch for one failed check.
        corrective_params = dict(processing_params)
        corrective_params["clipper_enabled"] = False
        corrective_params["limiter_crest_floor_db"] = float(processing_params.get("limiter_crest_floor_db", processing_params["target_dynamic_range_db"])) + 2.0
        corrected_stereo, corrected_lufs_gain_db, corrected_loudness_guard, corrected_limiter_report = bus_fn(
            stereo_prebus, sr, corrective_params, apply_glue_compression=bool(dynamics_recovery_mix <= 0.0)
        )
        corrected_analysis_after = _analysis_from_audio(corrected_stereo, sr)
        corrected_gain_match_db = float(np.clip(analysis_before["integrated_lufs"] - corrected_analysis_after["integrated_lufs"], -24.0, 24.0))
        corrected_matched_metrics = _transient_metrics(corrected_stereo * (10.0 ** (corrected_gain_match_db / 20.0)), sr)
        corrected_score = float(corrected_matched_metrics.get("drum_punch_estimate", 0.0))

        transient_corrective_action = {
            "attempted": True,
            "reduced": "clipper_and_limiter",
            "score_before_correction": round(master_transient_score, 4),
            "score_after_correction": round(corrected_score, 4),
        }
        # Only keep the corrective render if it actually helped — a
        # conservative corrective pass that didn't improve the metric it
        # was trying to fix isn't worth trading away whatever loudness the
        # original render had.
        if corrected_score > master_transient_score:
            stereo_processed = corrected_stereo
            lufs_gain_db = corrected_lufs_gain_db
            loudness_guard = corrected_loudness_guard
            limiter_report = corrected_limiter_report
            analysis_after = corrected_analysis_after
            master_transient_score = corrected_score
            transient_score_delta = master_transient_score - source_transient_score
            transient_qc_passed = bool(transient_score_delta >= -allowed_transient_loss or source_transient_score < 0.15)
            transient_corrective_action["applied"] = True
        else:
            transient_corrective_action["applied"] = False

    transient_qc = {
        "source_transient_score": round(source_transient_score, 4),
        "master_transient_score": round(master_transient_score, 4),
        "delta": round(transient_score_delta, 4),
        "allowed_loss": round(allowed_transient_loss, 4),
        "passed": transient_qc_passed,
        "corrective_action": transient_corrective_action,
    }

    # Final quality control (spec section 18) — checked against the actual
    # rendered signal, not assumed from the parameters that produced it.
    # Corrective action here is deliberately narrow and bounded (one pass,
    # only for issues cheaply and safely fixable with a scalar/array
    # operation on the already-finished master): a real DC-offset leak or a
    # gross channel imbalance gets fixed and re-verified; anything else
    # (over-compression, heavy limiting, phase problems) is reported, not
    # blindly reprocessed — those need a different processing decision
    # earlier in the chain, not a bolt-on fix after the fact.
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

    processing_applied = {
        "spectral_match_source": processing_params.get("spectral_match_source", "genre_profile"),
        "spectral_tilt": {
            "target_db_per_octave": processing_params.get("target_spectral_tilt_db_per_octave"),
            "measured_before_db_per_octave": processing_params.get("measured_spectral_tilt_db_per_octave"),
            "measured_after_db_per_octave": analysis_after.get("spectral_tilt_db_per_octave"),
        },
        "per_band_gain_changes_db": {k: round(float(v), 3) for k, v in processing_params["per_band_gain_changes_db"].items()},
        "compression_per_band": {
            name: {
                "ratio": round(float(processing_params["band_compression_ratio"][name]), 3),
                "threshold_db": round(float(processing_params["band_threshold_db"][name]), 3),
                "attack_ms": round(float(processing_params["band_attack_ms"][name]), 1),
                "release_ms": round(float(processing_params["band_release_ms"][name]), 1),
                "max_gain_reduction_db": round(float(processing_params["band_max_gain_reduction_db"][name]), 2),
                "dynamic_eq_max_reduction_db": round(float(processing_params["band_dynamic_eq_max_reduction_db"][name]), 2),
            }
            for name in band_names
        },
        "tier": tier,
        "deesser_strength": round(float(processing_params.get("deesser_strength", 0.0)), 3),
        "saturation_amount": round(float(processing_params["saturation_amount"]), 4),
        "width_adjustment": round(float(side_gain), 4),
        "low_band_stereo_keep": round(float(low_side_keep), 4),
        "mono_below_hz": mono_below_hz,
        "dynamics_recovery_mix": round(float(dynamics_recovery_mix), 4),
        "lufs_change": f"{analysis_before['integrated_lufs']:.2f} -> {analysis_after['integrated_lufs']:.2f}",
        "lufs_gain_applied_db": round(float(lufs_gain_db), 3),
        "limiter": limiter_report,
        "loudness_guard": loudness_guard,
        "mono_compatibility_action": mono_action,
        "section_detection": section_info,
        "section_automation": {
            "width_db": {"chorus": 0.5, "bridge": 0.25, "final_chorus": 0.6},
            "air_shelf_db": {"chorus": 0.2, "bridge": 0.1, "final_chorus": 0.24},
        },
        "user_tweaks": processing_params.get("user_tweaks", {}),
        "tweak_summary": processing_params.get("tweak_summary", {}),
        "category": processing_params.get("category"),
        "flavour": processing_params.get("flavour"),
        "category_tweak_bias": processing_params.get("category_tweak_bias", {}),
        "stem_separation": stem_metadata,
        "reference_track": reference_info,
        "input_validation": input_validation,
        "quality_control_corrections": quality_control.get("corrections_applied", []),
        "band_diagnosis": processing_params.get("band_diagnosis", {}),
        "vocal_presence_disabled_reason": processing_params.get("vocal_presence_disabled_reason"),
        "mix_diagnosis": processing_params.get("mix_diagnosis", []),
        "post_render_overshoot_corrections": overshoot_corrections,
        "transient_qc": transient_qc,
    }

    source_warnings = []
    if analysis_before.get("near_mono_source"):
        source_warnings.append(
            "Source file has little to no stereo content (left/right channels are nearly identical) — "
            "mastering can't create real stereo separation that was never in the recording. "
            "The width/wider controls have nothing to widen here."
        )
    for issue in processing_params.get("mix_diagnosis", []):
        # A problem mastering deliberately declined to "solve" by brightening
        # the whole master further (spec: "know when NOT to solve a mix
        # problem") — surfaced the same way as any other source limitation,
        # not hidden because nothing was processed for it.
        source_warnings.append(f"Mix note ({issue['issue']}): {issue['detail']}")

    ab_analysis = build_ab_report(
        analysis_before=analysis_before,
        analysis_after=analysis_after,
        processing_params=processing_params,
        limiter_report=limiter_report,
        quality_control=quality_control,
        transient_qc=transient_qc,
    )
    if not ab_analysis["improved"]:
        # Surfaced alongside source_warnings (not just buried in ab_analysis)
        # so a "louder but not actually better" result is visible wherever
        # the frontend already renders source_warnings, per "a master that
        # measures louder but sounds worse is a failure." Additive — never
        # replaces an existing warning (e.g. near_mono_source) already there.
        source_warnings = source_warnings + [f"Improvement check: {reason}" for reason in ab_analysis["verdict_reasons"]]

    decision_report = build_decision_report(processing_params, limiter_report, overshoot_corrections, transient_qc)

    # ---------------------------------------------------------------------
    # Absolute-level diagnostics (internal; not part of the customer flow).
    #
    # Measured on the ACTUAL rendered signal with the same function used on
    # the input, at matched loudness. This exists because every other band
    # measurement in this pipeline is a SHARE of total energy, and shares
    # are coupled: they sum to 1.0, so a render that only cuts bass
    # mechanically inflates every other band's number. Measured on a
    # synthetic case where only the low end moved, the share metric
    # reported +15.03 dB of "presence boost" that did not happen, while the
    # absolute metric correctly reported 0.00 dB. The share-based overshoot
    # check above (PRESENCE_VERIFY_BANDS) is therefore known to mis-fire in
    # exactly that situation and is left in place only because replacing it
    # changes rendered audio; this block is the correct measurement running
    # alongside it, reported but not yet acted upon.
    #
    # Read-only: nothing here alters the exported signal.
    # ---------------------------------------------------------------------
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
            # Keyed strictly, NOT with a permissive default. An earlier
            # version read "true_peak_dbtp" (the wrong name — the analysis
            # dict calls it "true_peak_db") and silently fell back to
            # -99.0, which meant the true-peak guardrail could never fire
            # and always reported a pass. A dead guardrail that reports
            # success is worse than no guardrail, so a missing key now
            # raises into the except below and shows up as
            # status="unavailable" instead of as a false pass.
            true_peak_dbtp=float(analysis_after["true_peak_db"]),
            rendered_lufs=float(analysis_after["integrated_lufs"]),
            # This track's own target, not a fixed platform number.
            target_lufs=float(processing_params["target_lufs"]),
            transient_delta=float(transient_score_delta),
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
            "target_lufs": processing_params["target_lufs"],
            "target_dynamic_range_db": processing_params["target_dynamic_range_db"],
            "target_width": processing_params["target_width"],
        },
    }
