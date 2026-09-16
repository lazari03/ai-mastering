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

    # De-esser strength: GENRE_TARGET_PROFILES never sets a baseline for
    # this (profile["deesser_strength"] is 0 unless the "better_vocals"
    # tag added +0.5 in _apply_tag_biases), so without this, de-essing
    # only ever engaged when a user happened to pick that tag — most
    # renders got none regardless of how sibilant the actual source was.
    # Adaptive base instead: presence_4000_6000hz + half of
    # brilliance_6000_20000hz is a proxy for how much of the source's
    # energy sits in the sibilance-prone range. Healthy sources sit
    # comfortably under ~10% combined; genuinely harsh/sibilant ones
    # (bright, vocal-forward, over-excited mixes) exceed it. Purely
    # additive on top of the tag/style-driven value, never replaces it.
    sibilance_energy = float(current_balance.get("presence_4000_6000hz", 0.0) + current_balance.get("brilliance_6000_20000hz", 0.0) * 0.5)
    adaptive_deesser_strength = float(np.clip((sibilance_energy - 0.10) * 6.0, 0.0, 1.0))
    deesser_strength = float(np.clip(adaptive_deesser_strength + profile["deesser_strength"], 0.0, 1.0))

    current_lufs = float(analysis["integrated_lufs"])
    clipping_input = bool(analysis["clipping_detected"])
    desired_lufs_gain_db = float(profile["target_lufs"] - current_lufs)
    max_lufs_raise_db = float(style_profile.get("max_lufs_raise_db", 2.0)) + category_bias["max_lufs_raise_delta"]

    # The style-level cap above is a flat, era-appropriate constant (e.g.
    # vintage_analog: 0.5dB, deliberately quiet by design) — but for styles
    # that don't call for that kind of restraint, a flat 1-3dB cap strands a
    # genuinely dynamic source far below a genre's real commercial target
    # regardless of how much crest-factor headroom it actually has to
    # spend: a source sitting on 16dB of crest against a 7-8dB pop target
    # can absorb a lot more than 1.2dB of gain through the limiter before
    # sounding pumped or squashed. Widen the ceiling (never narrow it) by
    # how much headroom the track has above what this genre/style's own
    # target_dynamic_range_db calls for once mastered — 0.65 is a
    # deliberately conservative fraction of that headroom, tuned to land
    # near (not exactly at) the target dynamic range post-limiting rather
    # than spend the entire budget and leave nothing for the limiter itself.
    # Self-limiting: a track that's already brickwalled (crest_db below the
    # target) computes ~0 headroom here and falls back to the flat style
    # cap untouched, so this only ever helps a track that actually has
    # room to give. Only ever raises the ceiling — desired_lufs_gain_db
    # itself is unaffected, so a style whose own (already style-shifted)
    # target_lufs calls for less than this still gets exactly that, never
    # more.
    crest_db_for_headroom = float(analysis.get("dynamic_range_db", 12.0))
    target_dr_for_headroom = float(profile["target_dynamic_range_db"])
    headroom_above_target_db = max(0.0, crest_db_for_headroom - target_dr_for_headroom)
    max_lufs_raise_db = max(max_lufs_raise_db, headroom_above_target_db * 0.65)

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

    # ---------------------------------------------------------------------
    # Target windows + confidence-scaled correction (mastering-philosophy
    # audit). Genre/reference targets are acceptable regions, not exact
    # destinations — the old logic below computed a nonzero correction for
    # ANY deviation, however small, then separately widened the ceiling for
    # severe cases. That meant a track already close to target still got
    # nudged (never truly "left alone"), and severity/deviation only ever
    # widened the ceiling, never shaped how quickly correction ramped in.
    # Replaced with one formula that does both:
    #   1. DEADBAND_DB — deviations smaller than this get exactly zero
    #      correction. 1.0dB is a raw (pre-any-scaling) energy-share
    #      deviation in a 7-band split of a whole mix — roughly a 12%
    #      linear energy difference — smaller than what's reliably
    #      perceived as a broad tonal shift on real program material, so
    #      "fixing" it is moving a filter for a difference nobody can hear.
    #   2. A saturating (diminishing-returns) curve on the excess beyond
    #      the deadband, asymptotic to a ceiling — replaces both the old
    #      flat correction_strength multiply AND the separate ad hoc
    #      "widen the ceiling once excess_db > 6" step with one continuous
    #      function: small excess ramps in gently (matches the old
    #      correction_strength-only behavior for moderate deviations),
    #      large excess approaches the ceiling smoothly instead of jumping
    #      to a second, wider hard clip.
    #   3. Asymmetric ceilings (BOOST_CEILING_DB < CUT_CEILING_DB) — a
    #      confidently-identified excess is safer to remove than a
    #      confidently-identified deficit is to add back (spec: automated
    #      mastering should be more conservative brightening/boosting than
    #      correcting an obvious excess).
    # ---------------------------------------------------------------------
    DEADBAND_DB = 1.0
    BOOST_CEILING_DB = 2.5
    CUT_CEILING_DB = 4.5
    # Excess (beyond the deadband) at which the curve reaches ~86% of its
    # ceiling — "a large, unambiguous deviation" per the confidence-scaling
    # requirement, tuned around the old logic's own 6dB "severe" threshold
    # (6dB excess + 1dB deadband ≈ 7dB raw, close to the old boundary) so
    # this pass changes *how* severity scales the correction, not *when*
    # a deviation starts counting as severe.
    SEVERITY_SATURATION_DB = 8.0
    _severity_k = float(-np.log(1.0 - 0.86) / SEVERITY_SATURATION_DB)

    per_band_gain_changes_db = {}
    band_diagnosis = {}
    energy_floor = 0.015
    for band_key in SPECTRAL_BAND_KEYS:
        current = float(current_balance.get(band_key, 0.0))
        target = float(target_balance.get(band_key, 0.0))
        current_safe = max(current, energy_floor)
        target_safe = max(target, energy_floor * 0.8)

        raw_delta_db = 20.0 * np.log10((target_safe + EPS) / (current_safe + EPS))
        raw_delta_db += profile["tag_bias_band_db"].get(band_key, 0.0)

        severity_db = max(0.0, abs(raw_delta_db) - DEADBAND_DB)
        if severity_db <= 0.0:
            per_band_gain_changes_db[band_key] = 0.0
            band_diagnosis[band_key] = {"raw_delta_db": round(raw_delta_db, 2), "severity_db": 0.0, "confidence": 0.0, "decision": "within_target_window"}
            continue

        ceiling = CUT_CEILING_DB if raw_delta_db < 0 else BOOST_CEILING_DB
        if clipping_input and raw_delta_db > 0:
            ceiling = min(ceiling, 2.0)
        confidence = float(1.0 - np.exp(-_severity_k * severity_db))
        delta_db = float(np.sign(raw_delta_db) * ceiling * confidence)
        if current < 0.008 and delta_db > 0:
            delta_db = min(delta_db, 1.2)
        per_band_gain_changes_db[band_key] = delta_db
        band_diagnosis[band_key] = {
            "raw_delta_db": round(raw_delta_db, 2),
            "severity_db": round(severity_db, 2),
            "confidence": round(confidence, 2),
            "decision": "corrected",
        }

    # ---------------------------------------------------------------------
    # HF/presence budget (mastering-philosophy audit). The three bands
    # above 2kHz were previously clamped to one SHARED ceiling (hf_cap) —
    # every one of them could independently reach that same number, so a
    # track needing help in only one of the three still got all three
    # pushed together, and nothing about it "knew" the other two bands
    # existed. Two changes:
    #   1. Each band gets its OWN normal ceiling instead of sharing one —
    #      2-4kHz <=1.0dB, 4-6kHz <=0.75dB, 6-20kHz <=1.0dB. These specific
    #      numbers are the conservative automatic-boost ceilings a real
    #      mastering engineer would treat as normal for these ranges before
    #      a track gives a genuinely severe reason to go further (below);
    #      they replace style_profile["hf_boost_cap_db"] as the per-band
    #      base (that constant becomes an availability multiplier instead —
    #      see GLOBAL_PRESENCE_BUDGET_DB below — a style calling for less
    #      brightness (e.g. vintage_analog) still tightens these caps, one
    #      calling for more never widens them past what a real engineer
    #      would call "guardrail, not mandatory move").
    #   2. A GLOBAL ceiling on the COMBINED positive move across all three
    #      — the actual audible result of "a bit of 3kHz + a bit of 5kHz +
    #      a bit of 8kHz" is brighter than any one of those numbers alone
    #      suggests, so summing and re-scaling when the total is too high
    #      is what actually prevents the cumulative-brightening failure
    #      mode, not three independent per-band checks that never talk to
    #      each other. vocal_presence_gain_db (computed below) is folded
    #      into this SAME budget once it exists — see the block after it.
    # ---------------------------------------------------------------------
    style_hf_multiplier = float(np.clip(1.0 + (float(style_profile["hf_boost_cap_db"]) - 1.5) * 0.3 + category_bias["hf_boost_cap_delta"] * 0.3, 0.5, 1.4))
    target_upper_mid_energy = float(
        target_balance.get("mid_500_2000hz", 0.0)
        + target_balance.get("high_mid_2000_4000hz", 0.0)
        + target_balance.get("presence_4000_6000hz", 0.0)
        + target_balance.get("brilliance_6000_20000hz", 0.0)
    )
    # Widens a band's own ceiling only when the source is genuinely,
    # severely dark relative to what this genre needs — same
    # deficit-proportional widening as before, just applied per band
    # instead of to one shared number, and with a smaller ceiling on the
    # widening itself for the tighter 4-6kHz band (harshness/sibilance
    # territory — the band that should earn a boost past its normal
    # ceiling least easily).
    upper_mid_deficit = max(0.0, target_upper_mid_energy - upper_mid_energy)
    hf_band_ceilings = {
        "high_mid_2000_4000hz": (1.0 * style_hf_multiplier) + float(np.clip(upper_mid_deficit * 4.0, 0.0, 1.2)),
        "presence_4000_6000hz": (0.75 * style_hf_multiplier) + float(np.clip(upper_mid_deficit * 3.0, 0.0, 0.75)),
        "brilliance_6000_20000hz": (1.0 * style_hf_multiplier) + float(np.clip(upper_mid_deficit * 4.0, 0.0, 1.2)),
    }
    for band_key, ceiling in hf_band_ceilings.items():
        per_band_gain_changes_db[band_key] = min(per_band_gain_changes_db[band_key], ceiling)

    # Combined budget: if the sum of the three bands' POSITIVE moves alone
    # exceeds this, scale the positive contributions down proportionally
    # (cuts are never touched by this — a shared brightness budget has
    # nothing to say about a band being confidently reduced). 2.0dB
    # combined is deliberately tighter than the 2.75dB sum of the three
    # individual ceilings above — a source that independently earns a
    # boost on all three bands at once is exactly the "sounds brighter
    # than any one number suggests" case this budget exists to catch.
    GLOBAL_PRESENCE_BUDGET_DB = 2.0
    hf_positive_sum = sum(max(0.0, per_band_gain_changes_db[k]) for k in hf_band_ceilings)
    hf_budget_scale = min(1.0, GLOBAL_PRESENCE_BUDGET_DB / hf_positive_sum) if hf_positive_sum > GLOBAL_PRESENCE_BUDGET_DB else 1.0
    if hf_budget_scale < 1.0:
        for band_key in hf_band_ceilings:
            if per_band_gain_changes_db[band_key] > 0.0:
                per_band_gain_changes_db[band_key] *= hf_budget_scale

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

    # vocal_presence_gain_db used to be a completely separate EQ move with
    # no awareness of the 2-6kHz static correction already computed above —
    # a track could get both a positive high_mid/presence correction AND a
    # positive vocal-presence boost, each individually within its own
    # limit, whose SUM still over-brightened the master (spec: "vocal
    # presence must not bypass HF protection"). Two rules, applied only to
    # the positive (brightening) direction — a negative vocal_presence_gain_db
    # (the mix is judged too forward already) never needed this protection:
    #   1. If the source's upper-mid energy already meets or exceeds this
    #      genre's own target for that range, a positive vocal-presence
    #      correction is disabled outright. A mix that's already at/above
    #      its target upper-mid share is not "missing" presence in any
    #      sense mastering EQ can fix — a buried vocal against an already
    #      dense 2-6kHz mix is a MIX-balance limitation (see
    #      mix_diagnosis below), not something more mastering brightness
    #      solves.
    #   2. Otherwise, vocal presence shares the SAME GLOBAL_PRESENCE_BUDGET_DB
    #      as the three static HF bands — it's added to that running total
    #      and rescaled down with them if the combined move is still over
    #      budget, rather than being a fourth, independent boost budget.
    vocal_presence_disabled_reason = None
    if vocal_presence_gain_db > 0.0:
        if upper_mid_energy >= target_upper_mid_energy:
            vocal_presence_disabled_reason = "source_upper_mid_already_at_or_above_target"
            vocal_presence_gain_db = 0.0
        else:
            remaining_budget = max(0.0, GLOBAL_PRESENCE_BUDGET_DB - sum(max(0.0, per_band_gain_changes_db[k]) for k in hf_band_ceilings))
            if vocal_presence_gain_db > remaining_budget:
                vocal_presence_disabled_reason = "shared_presence_budget_exhausted_by_static_eq"
                vocal_presence_gain_db = remaining_budget

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

    # Mix-problem diagnostic (spec: "some problems cannot be safely solved
    # during mastering") — scoped to the one case the HF/presence budget
    # above can actually detect from its own inputs: a vocal that measures
    # as needing more presence while the mix already sits at/above its
    # target upper-mid share. Reported so the caller can surface it, not
    # silently "solved" by brightening the whole master further.
    mix_diagnosis = []
    if vocal_presence_disabled_reason == "source_upper_mid_already_at_or_above_target":
        mix_diagnosis.append(
            {
                "issue": "probable_buried_vocal_or_dense_upper_mix",
                "detail": (
                    "Vocal presence appears low, but the 2-6kHz region is already at or above this genre's "
                    "target share. Further mastering EQ here would brighten the whole mix rather than the "
                    "vocal specifically. This is more likely a mix-balance limitation than something "
                    "mastering EQ can safely correct."
                ),
            }
        )

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
        "vocal_presence_disabled_reason": vocal_presence_disabled_reason,
        "deesser_strength": deesser_strength,
        "input_clipping_detected": clipping_input,
        "style_profile": style_profile,
        "band_diagnosis": band_diagnosis,
        "mix_diagnosis": mix_diagnosis,
        # Carried forward so the caller can re-check the ACTUAL rendered
        # spectrum against the same window this function used to decide
        # corrections — see mastering.py's post-render overshoot check.
        "target_spectral_balance": {k: round(float(v), 5) for k, v in target_balance.items()},
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
