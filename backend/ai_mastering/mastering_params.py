from __future__ import annotations

import numpy as np

from params import GENRE_TARGET_PROFILES, MASTERING_CATEGORY_PROFILES, MASTERING_STYLE_PROFILES

from .analysis.profile import SourceProfile
from .diagnostics.problems import detect_mastering_problems
from .planning.plan import apply_user_tweaks_to_plan, build_mastering_plan
from .planning.target_model import build_target_context
from .processing.eq import band_response_db


def _compute_transient_budget(analysis: dict, priorities: dict) -> dict:
    """How much transient/dynamics modification THIS source can tolerate —
    computed from what's actually in the analysis (transient strength/
    density, short-term crest factor, whole-file crest factor, PLR) and how
    expensive this genre says it is to damage those characteristics
    (preservation_priorities), never from a genre-name lookup table of
    compressor/clipper/saturation settings. A high-transient, healthy Rock
    mix and a loose, already-compressed Rock mix get very different budgets
    even though both are "rock" — genre only sets the PRICE of damaging a
    characteristic, source analysis decides whether that price is actually
    at stake.

    Returns several independent 0-1 budgets (1.0 = plenty of room left to
    process safely, near 0 = leave this alone) rather than one combined
    number — compression, saturation, and clipping damage transients
    through different mechanisms and shouldn't be forced to move together.
    """
    transient_strength = float(analysis.get("transient_strength", 0.0))
    short_term_crest_db = float(analysis.get("short_term_crest_db", 0.0))
    crest_db = float(analysis.get("dynamic_range_db", 10.0))
    plr_db = float(analysis.get("plr_db", 10.0))

    transients_priority = float(priorities.get("transients", 0.75))
    dynamic_priority = float(priorities.get("dynamic_contrast", 0.7))

    # "Health" = does the source already have real, intact transients/
    # dynamics worth protecting? High transient_strength AND a healthy
    # short-term crest factor (not already squashed) together mean this
    # track has the MOST to lose from further processing — 16dB short-term
    # crest is a generous, clearly-dynamic reference point (a heavily
    # limited master typically sits well under 10dB here, see the
    # pop-after.mp3 verification: 9.84dB short-term crest vs 12.52dB on its
    # own pre-master), so scaling against it saturates health at 1.0 for
    # genuinely dynamic material without needing a second magic threshold.
    health = float(np.clip((transient_strength * 0.5) + min(short_term_crest_db / 16.0, 1.0) * 0.5, 0.0, 1.0))

    # Budget shrinks as BOTH health and the genre's priority for that
    # dimension rise — multiplicatively, so a track needs to be BOTH
    # already-healthy AND in a genre that genuinely cares before the
    # budget actually approaches zero. Floored at 0.05, never fully zero —
    # "almost nothing" still leaves room for the smallest, safest moves
    # (final peak control) rather than hard-disabling a whole stage from
    # this formula alone.
    transient_budget = float(np.clip(1.0 - (health * transients_priority), 0.05, 1.0))
    dynamic_contrast_budget = float(np.clip(1.0 - (health * dynamic_priority), 0.05, 1.0))

    # Compression budget also folds in whether dynamics are ALREADY under
    # control elsewhere (a loud, low-crest, low-PLR pre-master) — no reason
    # to reserve compression budget for something that arrives pre-limited;
    # 8dB is comfortably below a healthy full-mix crest factor (typically
    # 12dB+) and comfortably above what heavy limiting leaves behind
    # (~6-9dB, per the pop-after.mp3 measurement above).
    already_controlled = crest_db < 8.0 or plr_db < 8.0
    compression_budget = transient_budget if not already_controlled else min(transient_budget, 0.5)

    # Saturation and clipping both act directly on the waveform's peaks —
    # scaled down further, specifically, by transient_strength (how
    # percussive the source already measures) on top of the shared budget.
    saturation_budget = float(np.clip(transient_budget * (1.0 - transient_strength * 0.4), 0.05, 1.0))
    clipper_budget = float(np.clip(transient_budget * (1.0 - transient_strength * 0.6), 0.0, 1.0))

    return {
        "transient_budget": round(transient_budget, 3),
        "dynamic_contrast_budget": round(dynamic_contrast_budget, 3),
        "compression_budget": round(compression_budget, 3),
        "saturation_budget": round(saturation_budget, 3),
        "clipper_budget": round(clipper_budget, 3),
        "source_health": round(health, 3),
    }


def _reference_relative_from_shares(shares: dict, band_layout: list[dict]) -> dict[str, float]:
    """Legacy callers pass a reference as 7-band energy shares; convert to
    the hi-res relative-spectrum representation (per-octave density,
    interpolated in log-frequency, normalised like the measured spectrum)."""
    from .planning import config as C

    ranges = {
        "sub_bass_20_60hz": (20.0, 60.0), "bass_60_250hz": (60.0, 250.0), "low_mid_250_500hz": (250.0, 500.0),
        "mid_500_2000hz": (500.0, 2000.0), "high_mid_2000_4000hz": (2000.0, 4000.0),
        "presence_4000_6000hz": (4000.0, 6000.0), "brilliance_6000_20000hz": (6000.0, 20000.0),
    }
    xs, ys = [], []
    for key, (lo, hi) in ranges.items():
        share = float(shares.get(key, 0.0))
        if share > 0:
            xs.append(np.log2(np.sqrt(lo * hi)))
            ys.append(10.0 * np.log10(share / np.log2(hi / lo)))
    if len(xs) < 3:
        return {}
    rel = {b["name"]: float(np.interp(np.log2(b["center_hz"]), xs, ys)) for b in band_layout}
    ref = [rel[b["name"]] for b in band_layout if C.RELATIVE_REF_LOW_HZ <= b["center_hz"] <= C.RELATIVE_REF_HIGH_HZ]
    off = float(np.mean(ref)) if ref else 0.0
    return {k: v - off for k, v in rel.items()}


def build_plan_for_analysis(
    analysis: dict,
    genre: str,
    tags: list[str],
    style: str = "modern",
    category: str | None = None,
    flavour: str | None = None,
    tier: str = "standard",
    reference_relative_db: dict | None = None,
    reference_spectral_balance: dict | None = None,
):
    """measurement -> diagnosis -> planning, as three explicit steps.
    Returns (profile, context, problems, plan)."""
    if "source_profile" not in analysis:
        raise ValueError("analysis has no source_profile (produced by an older engine version) — re-run analysis for this upload")
    profile = SourceProfile.from_dict(analysis["source_profile"])
    if reference_relative_db is None and reference_spectral_balance:
        reference_relative_db = _reference_relative_from_shares(reference_spectral_balance, profile.band_layout)
    context = build_target_context(profile.band_layout, genre, tags, style, category, flavour, reference_relative_db)
    problems = detect_mastering_problems(profile, context)
    plan = build_mastering_plan(profile, context, problems, tier=tier)
    return profile, context, problems, plan


_LEGACY_RANGES = {
    "sub_bass_20_60hz": (20.0, 60.0),
    "bass_60_250hz": (60.0, 250.0),
    "low_mid_250_500hz": (250.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_4000hz": (2000.0, 4000.0),
    "presence_4000_6000hz": (4000.0, 6000.0),
    "brilliance_6000_20000hz": (6000.0, 20000.0),
}


def _legacy_band_gains(plan) -> dict:
    """The plan's actual EQ response averaged over each legacy 7-band
    region — what the frontend's per-band EQ display shows. Truthful by
    construction: it is the response of the filters that are rendered."""
    layout = [{"name": k, "lo_hz": lo, "hi_hz": min(hi, plan.sample_rate * 0.49), "center_hz": float(np.sqrt(lo * hi))} for k, (lo, hi) in _LEGACY_RANGES.items()]
    return {k: round(float(v), 3) for k, v in band_response_db(plan.eq_decisions, layout, plan.sample_rate).items()}


def _mix_diagnosis(problems: list, profile: SourceProfile) -> list[dict]:
    """Problems mastering deliberately does NOT try to solve, surfaced so
    the caller can show them (not hidden because nothing was processed)."""
    notes = []
    texts = {
        "over_compression": "Source is already heavily limited/compressed (low PLR and short-term crest). Mastering cannot restore dynamics; loudness was not pushed further.",
        "clipping": "Source contains clipped (flat-topped) samples. This damage cannot be undone in mastering; gain decisions were made conservatively.",
        "weak_transients": "Drum/transient attacks measure weak. There is no transient designer in the mastering chain; compression and limiting were kept gentle so they don't soften them further.",
        "overly_narrow_stereo": "Source is (near-)mono above the low end. Mastering cannot create stereo separation that was never recorded.",
    }
    for p in problems:
        base = p.kind.rsplit("_", 1)[0] if p.kind[-1].isdigit() else p.kind
        if base in texts and p.severity >= 0.3 and (not p.actionable or base == "overly_narrow_stereo" and profile.near_mono):
            notes.append({"issue": base, "detail": texts[base]})
    return notes


def legacy_params_from_plan(plan, context, profile: SourceProfile, problems: list, analysis: dict, genre: str, tags: list[str], style: str, category: str | None, flavour: str | None, reference_used: bool) -> dict:
    """The historical processing_params dict (frontend, QC, stem path and
    reports read it), derived entirely from the plan. `_plan`, `_context`,
    `_profile`, `_problems` carry the objects for the renderer and are
    stripped before anything is serialised."""
    from .planning.target_model import resolve_category_bias

    band_names = ("sub", "low", "punch", "low_mid", "high_mid", "high")
    mb = plan.compression.get("multiband", {})
    mb_bands = mb.get("bands", {}) if mb.get("enabled") else {}
    rms_db = float(profile.rms_db)

    def band_val(name: str, key: str, off: float):
        src = mb_bands.get(name) or mb_bands.get("low" if name in ("sub", "punch") else name)
        return src.get(key, off) if src else off

    glue = plan.compression.get("glue", {})
    st = plan.stereo
    side_gain_db = float(st.get("side_gain_db", 0.0)) + float(st.get("user_side_gain_db", 0.0))
    tilt_target = float(np.polyfit(np.log2([b["center_hz"] for b in profile.band_layout if 50 <= b["center_hz"] <= 16000]), [context.tonal_target_db[b["name"]] for b in profile.band_layout if 50 <= b["center_hz"] <= 16000], 1)[0])
    dev = {b: {"deviation_db": round(profile.spectral_bands[b] - context.tonal_target_db[b], 2)} for b in context.tonal_target_db}
    for p in problems:
        for b in p.bands:
            dev[b]["problem"] = p.kind
    target_balance = {k: v for k, v in GENRE_TARGET_PROFILES[genre]["target_spectral_balance"].items()}

    return {
        "genre": genre,
        "style": style,
        "tags": tags,
        "category": category,
        "flavour": flavour if category else None,
        "category_tweak_bias": resolve_category_bias(category, flavour)["tweak_bias"],
        "category_tweak_bias_mode": "target_context",  # shifts the acceptable destination; never a direct EQ move
        "spectral_match_source": "reference_track" if reference_used else "genre_profile",
        "target_spectral_tilt_db_per_octave": round(tilt_target, 3),
        "measured_spectral_tilt_db_per_octave": round(float(profile.spectral_tilt), 3),
        "spectral_tilt_delta_db_per_octave": round(tilt_target - float(profile.spectral_tilt), 3),
        "target_lufs": float(plan.loudness["target_lufs"]),
        "target_dynamic_range_db": float(context.target_crest_db),
        "target_width": float(profile.stereo_width * 10.0 ** (side_gain_db / 20.0)),
        "lra_target_min_lu": float(np.clip(profile.lra_lu * 0.9, 2.0, 4.0)),
        "lra_target_max_lu": 4.0,
        "low_band_stereo_keep": 0.0 if st.get("lf_mono", {}).get("enabled") else 1.0,
        "glue_enabled": bool(glue.get("enabled")),
        "glue_ratio": float(glue.get("ratio", 1.0)),
        "glue_threshold_db": round(rms_db + float(glue.get("threshold_offset_db", 0.0)), 2) if glue.get("enabled") else 0.0,
        "side_gain": float(10.0 ** (side_gain_db / 20.0)),
        "saturation_amount": float(plan.saturation.get("amount", 0.0)) if plan.saturation.get("enabled") else 0.0,
        "per_band_gain_changes_db": _legacy_band_gains(plan),
        "band_compression_ratio": {n: float(band_val(n, "ratio", 1.0)) for n in band_names},
        "band_threshold_db": {n: round(rms_db + float(band_val(n, "threshold_offset_db", 0.0)), 2) for n in band_names},
        "band_attack_ms": {n: float(band_val(n, "attack_ms", 0.0)) for n in band_names},
        "band_release_ms": {n: float(band_val(n, "release_ms", 0.0)) for n in band_names},
        "band_max_gain_reduction_db": {n: float(band_val(n, "max_gain_reduction_db", 0.0)) for n in band_names},
        "band_dynamic_eq_max_reduction_db": {n: 0.0 for n in band_names},
        "compression_enabled": bool(plan.compression.get("enabled")),
        "limiter_release_ms": float(plan.limiter["release_ms"]),
        "limiter_budget_db": float(plan.limiter["budget_db"]),
        "clipper_enabled": bool(plan.clipper.get("enabled")),
        "limiter_crest_floor_db": float(plan.limiter.get("crest_floor_db", context.target_crest_db)),
        "transient_budgets": _compute_transient_budget(analysis, context.preservation_priorities),
        "preservation_priorities": context.preservation_priorities,
        # Vocal presence is no longer a separate always-computed boost: a
        # recessed 1-5 kHz region is detected like any other tonal problem
        # and must clear the same confidence gates and HF budget.
        "vocal_presence_gain_db": 0.0,
        "vocal_presence_disabled_reason": "superseded_by_measured_problem_detection",
        "deesser_strength": float(plan.deesser.get("strength", 0.0)) if plan.deesser.get("enabled") else 0.0,
        "input_clipping_detected": bool((profile.clipping or {}).get("detected")),
        "style_profile": context.style_profile,
        "band_diagnosis": dev,
        "mix_diagnosis": _mix_diagnosis(problems, profile),
        "target_spectral_balance": target_balance,
        "loudness_range": {k: plan.loudness[k] for k in ("preferred_lufs", "acceptable_min_lufs", "acceptable_max_lufs")},
        "mastering_plan": plan.to_dict(),
        "_plan": plan,
        "_context": context,
        "_profile": profile,
        "_problems": problems,
    }


def compute_processing_params(
    analysis: dict,
    genre: str,
    tags: list[str],
    style: str = "modern",
    reference_spectral_balance: dict | None = None,
    category: str | None = None,
    flavour: str | None = None,
    tier: str = "standard",
    reference_relative_db: dict | None = None,
) -> dict:
    """Source-dependent mastering parameters.

    measurement (analysis["source_profile"]) -> problem detection ->
    confidence gates -> budgets -> MasteringPlan -> legacy parameter view.

    Genre / style / category / flavour / tags / reference define the
    ACCEPTABLE DESTINATION (planning/target_model.py); they never prescribe
    a DSP move on their own. A healthy source yields a near-empty plan.
    """
    if genre not in GENRE_TARGET_PROFILES:
        raise ValueError(f"Unknown genre: {genre}")
    if style not in MASTERING_STYLE_PROFILES:
        raise ValueError(f"Unknown style: {style}")
    if category is not None and category not in MASTERING_CATEGORY_PROFILES:
        raise ValueError(f"Unknown mastering category: {category}")
    tags = list(tags or [])
    profile, context, problems, plan = build_plan_for_analysis(
        analysis, genre, tags, style, category, flavour, tier, reference_relative_db, reference_spectral_balance
    )
    return legacy_params_from_plan(plan, context, profile, problems, analysis, genre, tags, style, category, flavour, context.reference_used)


def public_params(params: dict) -> dict:
    """processing_params without the private object handles (JSON-safe)."""
    return {k: v for k, v in params.items() if not k.startswith("_")}


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


def _apply_user_tweaks(params: dict, analysis: dict, tweaks: dict | None) -> dict:
    """Explicit user sliders -> explicit, labelled plan decisions (see
    planning.plan.apply_user_tweaks_to_plan), then the legacy view is
    regenerated from the updated plan so every reported number matches
    what will be rendered."""
    slider = _sanitize_tweaks(tweaks)
    plan = params["_plan"].copy()
    apply_user_tweaks_to_plan(plan, slider)
    tuned = legacy_params_from_plan(
        plan, params["_context"], params["_profile"], params["_problems"], analysis,
        params["genre"], params["tags"], params["style"], params["category"], params["flavour"],
        params["spectral_match_source"] == "reference_track",
    )
    tuned["user_tweaks"] = slider
    tuned["tweak_summary"] = {
        "low_end_db": round(slider["low_end"] * 1.2, 3),
        "punch_amount": round(slider["punch"], 3),
        "presence_db": round(slider["presence"] * 0.8, 3),
        "brightness_db": round(slider["brightness"] * 0.8, 3),
        "warmth_amount": round(slider["warmth"], 3),
        "width_delta": round(slider["width"] * 0.7, 3),
        "loudness_delta_lufs": round(slider["loudness"] * 1.25, 3),
    }
    return tuned

