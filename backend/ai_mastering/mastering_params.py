from __future__ import annotations

import copy

import numpy as np

from params import (
    ADJUSTMENT_TAG_BIASES,
    GENRE_TARGET_PROFILES,
    MASTERING_CATEGORY_PROFILES,
    MASTERING_FLAVOURS,
    MASTERING_STYLE_PROFILES,
    SPECTRAL_BAND_KEYS,
)

from .audio_utils import EPS, _tilt_from_band_shares


def _apply_tag_biases(profile: dict, tags: list[str]) -> dict:
    biased = copy.deepcopy(profile)
    biased["tag_bias_band_db"] = {k: 0.0 for k in SPECTRAL_BAND_KEYS}
    biased["compression_aggression_delta"] = 0.0
    biased["presence_band_boost_db"] = 0.0
    biased["deesser_strength"] = 0.0
    biased["vocal_presence_target_delta"] = 0.0

    for tag in tags:
        if tag not in ADJUSTMENT_TAG_BIASES:
            continue
        delta = ADJUSTMENT_TAG_BIASES[tag]
        if "target_lufs_delta" in delta:
            biased["target_lufs"] += float(delta["target_lufs_delta"])
        if "max_stereo_width_delta" in delta:
            biased["max_stereo_width"] += float(delta["max_stereo_width_delta"])
        if "compression_aggression_delta" in delta:
            biased["compression_aggression_delta"] += float(delta["compression_aggression_delta"])
        if "saturation_delta" in delta:
            biased["base_saturation"] += float(delta["saturation_delta"])
        if "band_bias_db" in delta:
            for band_key, band_delta in delta["band_bias_db"].items():
                if band_key in biased["tag_bias_band_db"]:
                    biased["tag_bias_band_db"][band_key] += float(band_delta)
        if "presence_band_boost_db" in delta:
            biased["presence_band_boost_db"] += float(delta["presence_band_boost_db"])
        if "deesser_strength" in delta:
            biased["deesser_strength"] += float(delta["deesser_strength"])
        if "vocal_presence_delta" in delta:
            biased["vocal_presence_target_delta"] += float(delta["vocal_presence_delta"])

    biased["target_lufs"] = float(np.clip(biased["target_lufs"], -20.0, -6.0))
    biased["max_stereo_width"] = float(np.clip(biased["max_stereo_width"], 0.0, 1.5))
    biased["base_saturation"] = float(np.clip(biased["base_saturation"], 0.0, 0.6))
    biased["deesser_strength"] = float(np.clip(biased["deesser_strength"], 0.0, 1.0))
    return biased


def _resolve_category_bias(category: str | None, flavour: str | None) -> dict:
    """Combine a mastering category's profile with its (optional) flavour's
    small additional nudges into one flat delta dict — see
    params.py:MASTERING_CATEGORY_PROFILES for the field shape. Returns an
    all-zero/empty bias when no category is selected, so category is a pure
    opt-in: omitting it leaves genre + style behaving exactly as before this
    existed."""
    empty = {
        "target_lufs_delta": 0.0,
        "target_dynamic_range_delta": 0.0,
        "max_stereo_width_delta": 0.0,
        "saturation_delta": 0.0,
        "compression_aggression_delta": 0.0,
        "hf_boost_cap_delta": 0.0,
        "max_lufs_raise_delta": 0.0,
        "vocal_presence_delta": 0.0,
        "tweak_bias": {},
    }
    if not category or category not in MASTERING_CATEGORY_PROFILES:
        return empty

    combined = dict(empty)
    combined.update({k: v for k, v in MASTERING_CATEGORY_PROFILES[category].items() if k in empty})
    combined["tweak_bias"] = dict(MASTERING_CATEGORY_PROFILES[category].get("tweak_bias", {}))

    flavour_delta = MASTERING_FLAVOURS.get(category, {}).get(flavour) if flavour else None
    if flavour_delta:
        for key, value in flavour_delta.items():
            if key == "tweak_bias":
                continue
            combined[key] = combined.get(key, 0.0) + float(value)
        for tweak_key, tweak_value in flavour_delta.get("tweak_bias", {}).items():
            combined["tweak_bias"][tweak_key] = combined["tweak_bias"].get(tweak_key, 0.0) + float(tweak_value)

    return combined


def compute_processing_params(
    analysis: dict,
    genre: str,
    tags: list[str],
    style: str = "modern",
    reference_spectral_balance: dict | None = None,
    category: str | None = None,
    flavour: str | None = None,
) -> dict:
    """
    Compute adaptive mastering parameters from measured track state vs genre target.

    This function intentionally computes deltas from analysis rather than applying
    static settings, so each track receives only the correction it needs.

    reference_spectral_balance: when given (the 7-band spectral_balance of a
    user-uploaded reference track, from _analysis_from_audio), it replaces
    the genre profile's static target_spectral_balance as the EQ target —
    every band's correction below is then computed against what the
    reference track actually looks like, not a generic genre curve. Nothing
    else about the profile (target LUFS, dynamic range, width) changes —
    matching the spectral shape isn't the same as cloning the whole master.

    category / flavour: the optional musical-objective layer (Clean, Modern,
    Club, ...) from params.py:MASTERING_CATEGORY_PROFILES — a bias on top of
    the genre target, not a second fixed preset. Omit both for the original
    genre+style-only behavior.
    """
    if genre not in GENRE_TARGET_PROFILES:
        raise ValueError(f"Unknown genre: {genre}")
    if style not in MASTERING_STYLE_PROFILES:
        raise ValueError(f"Unknown style: {style}")
    if category is not None and category not in MASTERING_CATEGORY_PROFILES:
        raise ValueError(f"Unknown mastering category: {category}")

    profile = _apply_tag_biases(GENRE_TARGET_PROFILES[genre], tags)
    style_profile = MASTERING_STYLE_PROFILES[style]
    category_bias = _resolve_category_bias(category, flavour)

    profile["target_lufs"] += float(style_profile["target_lufs_delta"]) + category_bias["target_lufs_delta"]
    profile["target_dynamic_range_db"] += float(style_profile["target_dynamic_range_delta"]) + category_bias["target_dynamic_range_delta"]
    profile["max_stereo_width"] += float(style_profile["max_stereo_width_delta"]) + category_bias["max_stereo_width_delta"]
    profile["base_saturation"] += float(style_profile["saturation_delta"]) + category_bias["saturation_delta"]
    profile["compression_aggression_delta"] += category_bias["compression_aggression_delta"]
    profile["vocal_presence_target_delta"] += category_bias["vocal_presence_delta"]

    profile["target_lufs"] = float(np.clip(profile["target_lufs"], -20.0, -6.5))
    profile["target_dynamic_range_db"] = float(np.clip(profile["target_dynamic_range_db"], 5.0, 14.5))
    profile["max_stereo_width"] = float(np.clip(profile["max_stereo_width"], 0.0, 1.4))
    profile["base_saturation"] = float(np.clip(profile["base_saturation"], 0.0, 0.25))

    current_balance = analysis["spectral_balance"]
    target_balance = reference_spectral_balance if reference_spectral_balance else profile["target_spectral_balance"]

    # Spectral tilt: a single dB/octave slope summarizing "dark/bass-heavy"
    # vs "bright/thin" overall, on top of the 7-band per-band correction
    # above. Reported for visibility/QA rather than driving its own separate
    # EQ move — the per-band correction already reshapes the spectrum
    # toward target_balance, and a tilt value derived from that same
    # target_balance would just be restating the same correction as one
    # number, not adding a second independent control that could fight it.
    target_tilt_db_per_octave = _tilt_from_band_shares(target_balance)
    measured_tilt_db_per_octave = float(analysis.get("spectral_tilt_db_per_octave", 0.0))
    spectral_tilt_delta_db_per_octave = target_tilt_db_per_octave - measured_tilt_db_per_octave
    low_energy = float(current_balance.get("sub_bass_20_60hz", 0.0) + current_balance.get("bass_60_250hz", 0.0))
    low_mid_energy = float(current_balance.get("low_mid_250_500hz", 0.0))
    upper_mid_energy = float(
        current_balance.get("mid_500_2000hz", 0.0)
        + current_balance.get("high_mid_2000_4000hz", 0.0)
        + current_balance.get("presence_4000_6000hz", 0.0)
        + current_balance.get("brilliance_6000_20000hz", 0.0)
    )
    rock_low_end_protection = genre == "rock" and low_energy > 0.55

    current_lufs = float(analysis["integrated_lufs"])
    clipping_input = bool(analysis["clipping_detected"])
    desired_lufs_gain_db = float(profile["target_lufs"] - current_lufs)
    max_lufs_raise_db = float(style_profile.get("max_lufs_raise_db", 2.0)) + category_bias["max_lufs_raise_delta"]
    max_lufs_reduce_db = float(style_profile.get("max_lufs_reduce_db", -2.0))
    if clipping_input:
        max_lufs_raise_db = min(max_lufs_raise_db, 1.5)
    # Already-loud mixes should not be pushed hard; preserves punch and avoids "burnt" upper-mid perception.
    if current_lufs > -12.0:
        max_lufs_raise_db = min(max_lufs_raise_db, 0.5)
    if current_lufs > -10.7:
        max_lufs_raise_db = min(max_lufs_raise_db, 0.2)

    input_lra = float(analysis.get("loudness_range_lu", 0.0))
    crest_db = float(analysis.get("dynamic_range_db", 12.0))
    # "Already heavily limited" needs BOTH a narrow loudness_range_lu
    # (little loudness variation ACROSS the song — macro-dynamics) AND a
    # collapsed crest factor (peaks already sitting close to RMS — the
    # actual fingerprint a limiter/heavy compression leaves — micro-
    # dynamics). These used to be conflated: gating purely on a narrow LRA
    # meant any dense, consistently-arranged modern production (most pop/
    # EDM/hip-hop/club material — most of this app's genres) with a
    # perfectly healthy crest factor got its loudness stage silently
    # capped to a near-zero change regardless of genre/category/style,
    # even sitting on 15+dB of real, unused crest-factor headroom. Verified
    # against a real source file: LRA 2.2 (narrow) + crest factor 16.2dB
    # (healthy) previously produced a 0.1-0.3dB loudness move on every one
    # of 8 different genre/category/tier combinations — an inaudible no-op
    # the loudness targets never actually reached.
    already_limited = crest_db <= 9.0
    if input_lra <= 3.5 and already_limited:
        max_lufs_raise_db = min(max_lufs_raise_db, 0.4)
    limited_lufs_gain_db = float(np.clip(desired_lufs_gain_db, max_lufs_reduce_db, max_lufs_raise_db))
    effective_target_lufs = current_lufs + limited_lufs_gain_db

    if input_lra <= 3.5 and already_limited:
        effective_target_lufs = min(effective_target_lufs, current_lufs + 0.1)
    if input_lra <= 2.5 and already_limited:
        effective_target_lufs = min(effective_target_lufs, current_lufs)
    if input_lra <= 2.0 and already_limited:
        effective_target_lufs = min(effective_target_lufs, current_lufs - 0.3)

    per_band_gain_changes_db = {}
    correction_strength = 0.3 if clipping_input else 0.4
    energy_floor = 0.015
    for band_key in SPECTRAL_BAND_KEYS:
        current = float(current_balance.get(band_key, 0.0))
        target = float(target_balance.get(band_key, 0.0))
        current_safe = max(current, energy_floor)
        target_safe = max(target, energy_floor * 0.8)

        raw_delta_db = 20.0 * np.log10((target_safe + EPS) / (current_safe + EPS))
        raw_delta_db += profile["tag_bias_band_db"].get(band_key, 0.0)

        # Apply partial correction so mastering stays musical and avoids over-shaping weak material.
        delta_db = raw_delta_db * correction_strength
        if current < 0.008 and delta_db > 0:
            delta_db = min(delta_db, 1.2)

        # Severity-scaled correction ceiling — a flat cap treats a band
        # that's mildly off target (say 1.2x) identically to one that's
        # severely off (3-4x+), which systematically under-corrects
        # exactly the tracks that need correction most: a badly
        # bass-heavy source still only got the same -3.5dB as a mildly
        # bass-heavy one, so the imbalance visibly survived mastering.
        # Real mastering practice allows more correction specifically
        # when the analysis clearly identifies a real problem, not as a
        # blanket increase — so the ceiling only widens past the normal
        # ±3.5dB/+2.5dB range once the *raw* (pre correction_strength)
        # deviation itself is large (>6dB, roughly 2x off in power terms),
        # and only up to -6dB/+4dB even then — still a broad, musical
        # move, not a surgical one. A band within normal range is
        # completely unaffected by this.
        excess_db = max(0.0, abs(raw_delta_db) - 6.0)
        boost_limit = 2.0 if clipping_input else 2.5
        cut_limit = -3.5
        if raw_delta_db < 0:
            cut_limit = float(np.clip(-3.5 - excess_db * 0.4, -6.0, -3.5))
        else:
            boost_limit = float(np.clip(boost_limit + excess_db * 0.25, boost_limit, 4.0))
        per_band_gain_changes_db[band_key] = float(np.clip(delta_db, cut_limit, boost_limit))

    # Keep top-end moves style-aware (prevents brittle modernization when
    # older-era style is selected) — but the cap itself should widen when
    # the source is genuinely, severely dark relative to what this genre
    # actually needs, not just "a bit thin." Same severity-scaled
    # reasoning as the per-band ceiling above: compares the source's
    # actual upper-mid/presence/brilliance share against the target's own
    # sum for those same bands (not a fixed threshold), so the widening
    # is calibrated to how far short THIS track falls of what THIS genre
    # target actually calls for.
    hf_cap = float(style_profile["hf_boost_cap_db"]) + category_bias["hf_boost_cap_delta"]
    target_upper_mid_energy = float(
        target_balance.get("mid_500_2000hz", 0.0)
        + target_balance.get("high_mid_2000_4000hz", 0.0)
        + target_balance.get("presence_4000_6000hz", 0.0)
        + target_balance.get("brilliance_6000_20000hz", 0.0)
    )
    upper_mid_deficit = max(0.0, target_upper_mid_energy - upper_mid_energy)
    hf_cap += float(np.clip(upper_mid_deficit * 5.0, 0.0, 1.5))
    per_band_gain_changes_db["high_mid_2000_4000hz"] = min(per_band_gain_changes_db["high_mid_2000_4000hz"], hf_cap)
    per_band_gain_changes_db["presence_4000_6000hz"] = min(per_band_gain_changes_db["presence_4000_6000hz"], hf_cap)
    per_band_gain_changes_db["brilliance_6000_20000hz"] = min(per_band_gain_changes_db["brilliance_6000_20000hz"], hf_cap)

    # Guitar-burn guard: if the track already has meaningful upper-mid energy, avoid further push.
    # Threshold is a genuine proportion of total spectral energy (see
    # audio_utils.py:_spectral_balance_only) — every genre's own
    # target_spectral_balance sums mid+high_mid+presence+brilliance to
    # roughly 0.55-0.68, so 0.45 means "already within reach of a normal
    # mix's upper-band share," not an arbitrarily small number.
    if upper_mid_energy >= 0.45:
        per_band_gain_changes_db["mid_500_2000hz"] = min(per_band_gain_changes_db["mid_500_2000hz"], 0.15)
        per_band_gain_changes_db["high_mid_2000_4000hz"] = min(per_band_gain_changes_db["high_mid_2000_4000hz"], 0.12)
        per_band_gain_changes_db["presence_4000_6000hz"] = min(per_band_gain_changes_db["presence_4000_6000hz"], 0.10)
        per_band_gain_changes_db["brilliance_6000_20000hz"] = min(per_band_gain_changes_db["brilliance_6000_20000hz"], 0.22)

    if rock_low_end_protection:
        # Heavy low-end rock mixes often need preservation more than correction.
        per_band_gain_changes_db["sub_bass_20_60hz"] = max(per_band_gain_changes_db["sub_bass_20_60hz"], -1.0)
        per_band_gain_changes_db["bass_60_250hz"] = max(per_band_gain_changes_db["bass_60_250hz"], -0.4)

        # Prevent low-mid/mid boosts from turning the result into a guitar-forward remaster.
        low_mid_boost_cap = 0.45 if low_mid_energy > 0.05 else 0.7
        per_band_gain_changes_db["low_mid_250_500hz"] = min(per_band_gain_changes_db["low_mid_250_500hz"], low_mid_boost_cap)
        per_band_gain_changes_db["mid_500_2000hz"] = min(per_band_gain_changes_db["mid_500_2000hz"], 0.35)
        per_band_gain_changes_db["high_mid_2000_4000hz"] = min(per_band_gain_changes_db["high_mid_2000_4000hz"], 0.45)

        # Only allow modest top-end lift when upper bands are genuinely
        # missing — well below the ~0.55-0.68 a normal mix's own genre
        # target sums to (same proportion scale as the guard above).
        if upper_mid_energy < 0.35:
            per_band_gain_changes_db["presence_4000_6000hz"] = min(per_band_gain_changes_db["presence_4000_6000hz"], 0.6)
            per_band_gain_changes_db["brilliance_6000_20000hz"] = min(per_band_gain_changes_db["brilliance_6000_20000hz"], 0.5)
        else:
            per_band_gain_changes_db["presence_4000_6000hz"] = min(per_band_gain_changes_db["presence_4000_6000hz"], 0.35)
            per_band_gain_changes_db["brilliance_6000_20000hz"] = min(per_band_gain_changes_db["brilliance_6000_20000hz"], 0.3)

    # Bass foundation + mild mud control around 200-300 Hz.
    per_band_gain_changes_db["bass_60_250hz"] = float(np.clip(per_band_gain_changes_db["bass_60_250hz"] + 0.5, -3.5, 2.5))
    if low_mid_energy > 0.11:
        per_band_gain_changes_db["low_mid_250_500hz"] = float(np.clip(per_band_gain_changes_db["low_mid_250_500hz"] - 0.35, -3.5, 2.0))

    dr_current = float(analysis["dynamic_range_db"])
    dr_target = float(profile["target_dynamic_range_db"])
    dr_excess = dr_current - dr_target
    compression_drive = max(0.0, dr_excess) + profile["compression_aggression_delta"]
    # Same already_limited fix as the loudness clamps above: dr_excess
    # already IS a crest-factor-based signal for how much compression this
    # track calls for, so damping it further just because LRA is narrow
    # (common on dense, consistently-arranged modern material — see
    # already_limited's comment) double-penalized tracks that actually
    # have real crest-factor headroom to use. Only damp when the source
    # is genuinely already limited.
    if already_limited:
        compression_drive *= 0.4
    if clipping_input:
        compression_drive *= 0.7
    if rock_low_end_protection:
        compression_drive *= 0.82

    base_ratio = 1.25 + (compression_drive * 0.12)
    band_ratio = {
        "low": float(np.clip(base_ratio + max(0.0, per_band_gain_changes_db["bass_60_250hz"]) * 0.04, 1.15, 2.6)),
        "low_mid": float(np.clip(base_ratio + max(0.0, per_band_gain_changes_db["low_mid_250_500hz"]) * 0.04, 1.15, 2.6)),
        "high_mid": float(np.clip(base_ratio + max(0.0, per_band_gain_changes_db["high_mid_2000_4000hz"]) * 0.04, 1.15, 2.6)),
        "high": float(np.clip(base_ratio + max(0.0, per_band_gain_changes_db["brilliance_6000_20000hz"]) * 0.04, 1.15, 2.6)),
    }
    if rock_low_end_protection:
        band_ratio["low"] = min(band_ratio["low"], 1.45)
        band_ratio["low_mid"] = min(band_ratio["low_mid"], 1.6)

    # Professional tier only: "punch" (90-250Hz, kick/bass-note fundamentals)
    # inherits the existing "low" tuning verbatim — that ratio was already
    # tuned with punch/kick tags in mind. "sub" (20-90Hz) gets its own, much
    # gentler ratio computed the same way but off sub_bass_20_60hz specifically
    # instead of the blended sub+bass delta "low" uses. Additive only — the
    # free tier only ever reads band_ratio["low"], never touches these keys.
    band_ratio["punch"] = band_ratio["low"]
    band_ratio["sub"] = float(np.clip(base_ratio + max(0.0, per_band_gain_changes_db["sub_bass_20_60hz"]) * 0.02, 1.05, 1.6))
    if rock_low_end_protection:
        band_ratio["sub"] = min(band_ratio["sub"], 1.3)

    # Keep compression musically light: reduce multiband compression by ~45%.
    for band_name in band_ratio:
        band_ratio[band_name] = float(1.0 + ((band_ratio[band_name] - 1.0) * 0.55))

    threshold_base = -27.0 + min(3.0, compression_drive * 0.45)
    band_threshold_db = {
        "low": float(np.clip(threshold_base - 1.0, -30.0, -14.0)),
        "low_mid": float(np.clip(threshold_base - 0.5, -30.0, -14.0)),
        "high_mid": float(np.clip(threshold_base, -30.0, -14.0)),
        "high": float(np.clip(threshold_base + 0.5, -30.0, -14.0)),
    }
    # "punch" reuses "low"'s threshold; "sub" triggers later (higher headroom
    # before gain reduction engages) — sub-bass over-compression is the exact
    # complaint this split exists to fix.
    band_threshold_db["punch"] = band_threshold_db["low"]
    band_threshold_db["sub"] = float(np.clip(threshold_base - 4.0, -32.0, -18.0))

    # Per-band attack/release/max-reduction. Previously these were a 2-3-way
    # ternary baked directly into dsp_filters.py — every band now gets its
    # own values, computed here so they're inspectable/reportable like every
    # other per-band parameter, not hidden inside the DSP code. Values are
    # constants tuned per band's role (sub: slow, no transient to protect;
    # punch/high_mid/high: faster, transient-sensitive), not yet
    # analysis-adaptive — that's a separate item (adaptive limiter behavior).
    band_attack_ms = {
        "sub": 90.0,
        "low": 40.0,
        "punch": 20.0,
        "low_mid": 35.0,
        "high_mid": 15.0,
        "high": 10.0,
    }
    band_release_ms = {
        "sub": 220.0,
        "low": 160.0,
        "punch": 130.0,
        "low_mid": 120.0,
        "high_mid": 100.0,
        "high": 90.0,
    }
    # How much gain reduction a single band is allowed to accumulate before
    # the compressor's output gets blended back toward dry (see
    # dsp_filters.py:_process_band) — stops one band from being crushed even
    # if its threshold/ratio combination would otherwise call for more.
    band_max_gain_reduction_db = {
        "sub": 3.5,
        "low": 5.0,
        "punch": 4.5,
        "low_mid": 4.0,
        "high_mid": 3.5,
        "high": 3.0,
    }
    if rock_low_end_protection:
        band_max_gain_reduction_db["sub"] = min(band_max_gain_reduction_db["sub"], 2.0)
        band_max_gain_reduction_db["low"] = min(band_max_gain_reduction_db["low"], 3.0)

    # Dynamic EQ cap per band — narrower and gentler than the band's own
    # compressor cap above (0.6x, capped at 2.5dB): this only tames the
    # hottest ~25% of activity at one problem frequency inside the band, on
    # top of everything else, so it needs a tighter leash than the band's
    # broadband compressor.
    band_dynamic_eq_max_reduction_db = {
        name: round(min(2.5, value * 0.6), 2) for name, value in band_max_gain_reduction_db.items()
    }

    desired_width = min(
        float(profile["max_stereo_width"]),
        max(0.0, float(analysis["stereo_width_estimate"]) + (float(profile["max_stereo_width"]) - float(analysis["stereo_width_estimate"])) * 0.2),
    )
    if analysis["mono_compatibility_risk"]:
        desired_width = min(desired_width, 1.0)
    if clipping_input:
        desired_width = min(desired_width, float(analysis["stereo_width_estimate"]) * 1.08)

    current_width = max(0.0001, float(analysis["stereo_width_estimate"]))
    side_gain = float(np.clip(desired_width / current_width, 0.82, 1.04))

    vocal_target = float(np.clip(0.26 + profile["vocal_presence_target_delta"], 0.18, 0.36))
    vocal_delta = vocal_target - float(analysis["vocal_presence_estimate"])
    vocal_presence_gain_db = float(np.clip(vocal_delta * 8.0 + profile["presence_band_boost_db"] * 0.5, -1.5, 1.8))
    if rock_low_end_protection:
        vocal_presence_gain_db = min(vocal_presence_gain_db, 0.6)

    saturation_amount = float(np.clip(profile["base_saturation"] + max(0.0, -dr_excess) * 0.0035, 0.0, 0.12))
    if clipping_input:
        saturation_amount *= 0.7

    # Adaptive limiter release: previously a fixed constant (120ms standard
    # tier, 60ms pro tier) regardless of the track. Real mastering limiters
    # tie release to program tempo — fast material needs the gain to
    # recover before the next transient or hits get audibly squashed
    # together; slow material can hold longer without smearing anything,
    # and holding longer there reduces audible pumping. Base release is a
    # fraction of the beat period (0.22x, clipped to 50-220ms — chosen so
    # the whole normal musical tempo range, ~60-200bpm, actually produces
    # different release times instead of every track past ~140bpm
    # saturating at the same ceiling), then nudged by how dynamic/peaky the
    # source already is.
    measured_tempo_bpm = float(analysis.get("tempo_bpm", 0.0)) or 120.0
    beat_period_ms = 60000.0 / float(np.clip(measured_tempo_bpm, 40.0, 220.0))
    base_release_ms = float(np.clip(beat_period_ms * 0.22, 50.0, 220.0))
    crest_db = float(analysis.get("dynamic_range_db", 8.0))
    release_adjust_ms = float(np.clip((crest_db - 8.0) * 3.0, -25.0, 30.0))
    limiter_release_ms = float(np.clip(base_release_ms + release_adjust_ms, 40.0, 250.0))

    return {
        "genre": genre,
        "style": style,
        "tags": tags,
        "category": category,
        "flavour": flavour if category else None,
        "category_tweak_bias": category_bias["tweak_bias"],
        "spectral_match_source": "reference_track" if reference_spectral_balance else "genre_profile",
        "target_spectral_tilt_db_per_octave": round(target_tilt_db_per_octave, 3),
        "measured_spectral_tilt_db_per_octave": round(measured_tilt_db_per_octave, 3),
        "spectral_tilt_delta_db_per_octave": round(spectral_tilt_delta_db_per_octave, 3),
        "target_lufs": float(effective_target_lufs),
        "target_dynamic_range_db": float(profile["target_dynamic_range_db"]),
        "target_width": float(desired_width),
        "lra_target_min_lu": float(np.clip(input_lra * 0.9, 2.0, 4.0)),
        "lra_target_max_lu": 4.0,
        "low_band_stereo_keep": 0.93,
        "glue_enabled": bool(input_lra > 2.8 and not clipping_input),
        "glue_ratio": 1.2 if input_lra > 4.0 else 1.12,
        "glue_threshold_db": -20.5 if input_lra > 4.0 else -22.0,
        "side_gain": side_gain,
        "saturation_amount": saturation_amount,
        "per_band_gain_changes_db": per_band_gain_changes_db,
        "band_compression_ratio": band_ratio,
        "band_threshold_db": band_threshold_db,
        "band_attack_ms": band_attack_ms,
        "band_release_ms": band_release_ms,
        "band_max_gain_reduction_db": band_max_gain_reduction_db,
        "band_dynamic_eq_max_reduction_db": band_dynamic_eq_max_reduction_db,
        "limiter_release_ms": round(limiter_release_ms, 1),
        "vocal_presence_gain_db": vocal_presence_gain_db,
        "deesser_strength": float(profile["deesser_strength"]),
        "input_clipping_detected": clipping_input,
        "style_profile": style_profile,
    }


def _sanitize_tweaks(tweaks: dict | None) -> dict:
    defaults = {
        "low_end": 0.0,
        "punch": 0.0,
        "presence": 0.0,
        "brightness": 0.0,
        "warmth": 0.0,
        "width": 0.0,
        "loudness": 0.0,
    }
    if not tweaks:
        return defaults

    sanitized = dict(defaults)
    for key in defaults:
        raw = tweaks.get(key, 0.0)
        try:
            sanitized[key] = float(np.clip(float(raw), -1.0, 1.0))
        except (TypeError, ValueError):
            sanitized[key] = 0.0
    return sanitized


def _clamp_tweaked_band(base_db: float, tweak_delta_db: float, safety_bound_db: float = 7.0) -> float:
    """Adds a user-tweak nudge on top of the already-computed adaptive
    per-band correction, with only a wide outer safety clamp — not a tight
    fixed range. compute_processing_params already bounds the adaptive
    value (including a severity-scaled ceiling for genuinely problematic
    bands, up to -6/+4dB); re-clamping the combined result here to a small
    fixed range (e.g. [-2.5, 2.0]) — as this used to do, unconditionally,
    even with zero tweaks applied — silently overrode that scaling and
    made the real effective correction ceiling far smaller than
    compute_processing_params computed or documented, on every render."""
    return float(np.clip(base_db + tweak_delta_db, -safety_bound_db, safety_bound_db))


def _apply_user_tweaks(params: dict, analysis: dict, tweaks: dict | None) -> dict:
    tuned = copy.deepcopy(params)
    slider = _sanitize_tweaks(tweaks)

    low_end = slider["low_end"]
    punch = slider["punch"]
    presence = slider["presence"]
    brightness = slider["brightness"]
    warmth = slider["warmth"]
    width = slider["width"]
    loudness = slider["loudness"]

    tuned["target_lufs"] = float(np.clip(tuned["target_lufs"] + (loudness * 1.25), -20.0, -7.0))

    gains = tuned["per_band_gain_changes_db"]
    gains["sub_bass_20_60hz"] = _clamp_tweaked_band(gains["sub_bass_20_60hz"], low_end * 1.2)
    gains["bass_60_250hz"] = _clamp_tweaked_band(gains["bass_60_250hz"], low_end * 1.0 + punch * 0.35)
    gains["low_mid_250_500hz"] = _clamp_tweaked_band(gains["low_mid_250_500hz"], warmth * 0.8 - punch * 0.35)
    gains["mid_500_2000hz"] = _clamp_tweaked_band(gains["mid_500_2000hz"], -low_end * 0.2 + presence * 0.2)
    gains["high_mid_2000_4000hz"] = _clamp_tweaked_band(gains["high_mid_2000_4000hz"], presence * 0.8 + brightness * 0.35)
    gains["presence_4000_6000hz"] = _clamp_tweaked_band(gains["presence_4000_6000hz"], presence * 0.6 + brightness * 0.55)
    gains["brilliance_6000_20000hz"] = _clamp_tweaked_band(gains["brilliance_6000_20000hz"], brightness * 0.8 - warmth * 0.25)

    tuned["vocal_presence_gain_db"] = float(
        np.clip(tuned["vocal_presence_gain_db"] + (presence * 0.45), -1.5, 1.5)
    )
    tuned["saturation_amount"] = float(np.clip(tuned["saturation_amount"] + (warmth * 0.05), 0.0, 0.22))

    tuned["side_gain"] = float(np.clip(tuned["side_gain"] + (width * 0.08), 0.75, 1.18))
    tuned["target_width"] = float(np.clip(tuned["target_width"] * tuned["side_gain"] / max(params["side_gain"], EPS), 0.0, 1.3))

    # Punch is primarily transient preservation: slightly reduce low-band compression and tighten release.
    low_ratio = tuned["band_compression_ratio"]["low"] - (punch * 0.18)
    low_mid_ratio = tuned["band_compression_ratio"]["low_mid"] - (punch * 0.12)
    tuned["band_compression_ratio"]["low"] = float(np.clip(low_ratio, 1.1, 2.2))
    tuned["band_compression_ratio"]["low_mid"] = float(np.clip(low_mid_ratio, 1.1, 2.3))
    tuned["band_threshold_db"]["low"] = float(np.clip(tuned["band_threshold_db"]["low"] - (punch * 1.2), -30.0, -14.0))
    tuned["band_threshold_db"]["low_mid"] = float(np.clip(tuned["band_threshold_db"]["low_mid"] - (punch * 0.8), -30.0, -14.0))

    tuned["user_tweaks"] = slider
    tuned["tweak_summary"] = {
        "low_end_db": round(low_end * 1.0, 3),
        "punch_amount": round(punch, 3),
        "presence_db": round(presence * 0.8, 3),
        "brightness_db": round(brightness * 0.8, 3),
        "warmth_amount": round(warmth, 3),
        "width_delta": round(width * 0.08, 3),
        "loudness_delta_lufs": round(loudness * 1.25, 3),
    }
    return tuned
