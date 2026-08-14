from __future__ import annotations

import copy
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import HighShelfFilter, Pedalboard, Reverb

from .audio_utils import MASTER_SR, _analysis_from_audio, _load_audio
from .bus_processing import _bus_process, _bus_process_pro
from .dsp_filters import _build_stereo_from_ms, _lr4_highpass, _lr4_lowpass, _oversampled_distortion, _process_band, _split_bands, _split_bands_pro
from .mastering_params import _apply_user_tweaks, compute_processing_params
from .section_detection import _db_to_lin, _detect_song_sections, _section_gain_db_envelope
from .stem_separation import _is_stem_separation_requested, _process_accompaniment_stem, _process_vocal_stem, _separate_vocal_stems


def master_track(
    input_path: str | Path,
    output_path: str | Path,
    genre: str,
    tags: list[str],
    tweaks: dict | None = None,
    style: str = "modern",
    enable_stem_separation: bool = False,
    tier: str = "standard",
) -> dict:
    is_pro = tier == "professional"
    split_fn = _split_bands_pro if is_pro else _split_bands
    bus_fn = _bus_process_pro if is_pro else _bus_process
    band_names = ("sub", "punch", "low_mid", "high_mid", "high") if is_pro else ("low", "low_mid", "high_mid", "high")

    audio_stereo, sr = _load_audio(input_path, sr=MASTER_SR)

    analysis_before = _analysis_from_audio(audio_stereo, sr)
    processing_params = compute_processing_params(analysis_before, genre=genre, tags=tags, style=style)
    processing_params = _apply_user_tweaks(processing_params, analysis_before, tweaks)

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

    prebus_analysis = _analysis_from_audio(stereo_prebus, sr)
    mono_action = "none"
    if prebus_analysis["mono_compatibility_risk"] and not analysis_before["mono_compatibility_risk"]:
        side_gain = 1.0 + (side_gain - 1.0) * 0.4
        side_width_adjusted = (low_side * low_side_keep) + (high_side * side_gain * width_auto_lin)
        stereo_prebus = _build_stereo_from_ms(mid_processed, side_width_adjusted)
        mono_action = "reduced_width_to_avoid_cancellation"

    stereo_processed, lufs_gain_db, loudness_guard, limiter_report = bus_fn(stereo_prebus, sr, processing_params)

    # Dynamic retention: blend in a touch of cleaner pre-master content when LRA gets over-flattened.
    pre_lra = float(prebus_analysis.get("loudness_range_lu", 0.0))
    post_lra = float(_analysis_from_audio(stereo_processed, sr).get("loudness_range_lu", 0.0))
    lra_target_min = float(processing_params.get("lra_target_min_lu", 2.5))
    desired_min_lra = max(2.0, min(lra_target_min, float(analysis_before.get("loudness_range_lu", 2.0)) * 0.85))
    dynamics_recovery_mix = 0.0
    if post_lra < desired_min_lra:
        source_lra = float(analysis_before.get("loudness_range_lu", pre_lra))
        needed = min(desired_min_lra - post_lra, max(0.0, source_lra - post_lra))
        dynamics_recovery_mix = float(np.clip(needed / max(source_lra, 0.1), 0.08, 0.42))
        stereo_processed = (stereo_processed * (1.0 - dynamics_recovery_mix)) + (premaster_audio * dynamics_recovery_mix)
        # Re-apply finalization after blend, but avoid forcing loudness up when dynamics are already narrow.
        recovery_params = copy.deepcopy(processing_params)
        recovery_params["target_lufs"] = min(
            float(recovery_params.get("target_lufs", analysis_before["integrated_lufs"])),
            float(analysis_before["integrated_lufs"]) + 0.2,
        )
        stereo_processed, lufs_gain_db, loudness_guard, limiter_report = bus_fn(
            stereo_processed,
            sr,
            recovery_params,
            apply_glue_compression=False,
        )

    sf.write(str(output_path), stereo_processed, sr, subtype="PCM_24")
    analysis_after = _analysis_from_audio(stereo_processed, sr)

    processing_applied = {
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
        "stem_separation": stem_metadata,
    }

    return {
        "analysis_before": analysis_before,
        "analysis_after": analysis_after,
        "processing_applied": processing_applied,
        "target_profile_used": {
            "genre": genre,
            "style": style,
            "target_lufs": processing_params["target_lufs"],
            "target_dynamic_range_db": processing_params["target_dynamic_range_db"],
            "target_width": processing_params["target_width"],
        },
    }
