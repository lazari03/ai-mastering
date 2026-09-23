"""Source-dependent processing budgets.

* change budget — how much this recording NEEDS to change overall; a
  healthy mix gets a small budget, so many individually "small" moves
  cannot add up to a different-sounding master;
* limiter damage budget — how much peak gain reduction this source
  tolerates before its transients suffer;
* compression need — whether compression is beneficial at all.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from ..analysis.profile import SourceProfile
from . import config as C
from .target_model import TargetContext

if TYPE_CHECKING:  # pragma: no cover
    from ..diagnostics.problems import Problem

_CATEGORY_WEIGHT = {"tonal": 1.0, "dynamics": 0.7, "stereo": 0.5, "loudness": 0.3, "integrity": 0.8}


def _ramp(x: float, lo: float, hi: float) -> float:
    return float(np.clip((x - lo) / max(hi - lo, 1e-9), 0.0, 1.0))


def calculate_change_budget(profile: SourceProfile, problems: list["Problem"]) -> dict:
    """0..1. Combines actionable problems as independent evidence
    (1 - prod(1 - s*c*w)) so one severe problem or several moderate ones
    both raise the budget, but it saturates rather than summing past 1."""
    remaining = 1.0
    contributions = {}
    for p in problems:
        # Only problems that justify CHANGING the recording's character
        # count. Loudness below range is the normal state of a pre-master;
        # peak/headroom facts are handled by the limiter plan directly.
        if not p.actionable or p.category == "loudness":
            continue
        w = _CATEGORY_WEIGHT.get(p.category, 0.5)
        term = float(np.clip(p.severity * p.confidence * w, 0.0, 1.0))
        contributions[p.kind] = round(term, 3)
        remaining *= 1.0 - term
    load = 1.0 - remaining
    budget = C.CHANGE_BUDGET_MIN + (1.0 - C.CHANGE_BUDGET_MIN) * load
    return {
        "change_budget": round(budget, 3),
        "problem_load": round(load, 3),
        "eq_budget_db": round(C.EQ_BUDGET_MIN_DB + (C.EQ_BUDGET_MAX_DB - C.EQ_BUDGET_MIN_DB) * budget, 3),
        "contributions": contributions,
    }


def calculate_limiter_budget(profile: SourceProfile, context: TargetContext) -> dict:
    """dB of limiter gain reduction allowed at the 99.5th-percentile 10 ms
    peak. Strong, healthy transients in a genre that prices them highly
    shrink it; already-limited material shrinks it further (more limiting
    on a brickwalled source only adds distortion); clipped input caps it."""
    transient_priority = float(context.preservation_priorities.get("transients", 0.75))
    budget = C.LIMITER_BUDGET_MAX_DB - C.LIMITER_TRANSIENT_PENALTY_DB * profile.transient_health * transient_priority
    budget *= 1.0 - 0.7 * profile.already_limited_score
    reasons = [
        f"transient health {profile.transient_health:.2f} x priority {transient_priority:.2f}",
        f"already-limited score {profile.already_limited_score:.2f}",
    ]
    if (profile.clipping or {}).get("detected"):
        budget = min(budget, 1.5)
        reasons.append("input clipping detected: capped at 1.5 dB")
    budget = float(np.clip(budget, C.LIMITER_BUDGET_MIN_DB, C.LIMITER_BUDGET_MAX_DB))
    return {"budget_db": round(budget, 3), "reasons": reasons}


def limiter_only_achievable_lufs(profile: SourceProfile, context: TargetContext, limiter_budget_db: float) -> float:
    """Loudness reachable by gain + limiting alone without exceeding the
    limiter damage budget (peak estimate: 99.5th-percentile 10 ms peak)."""
    return float(profile.integrated_lufs + C.LIMITER_CEILING_DBTP + limiter_budget_db - profile.peak_p995_db)


def calculate_compression_need(profile: SourceProfile, context: TargetContext) -> dict:
    transient_priority = float(context.preservation_priorities.get("transients", 0.75))
    dynamic_priority = float(context.preservation_priorities.get("dynamic_contrast", 0.7))
    limiter_budget = calculate_limiter_budget(profile, context)["budget_db"]
    achievable = limiter_only_achievable_lufs(profile, context, limiter_budget)
    shortfall = context.acceptable_min_lufs - achievable
    micro = _ramp(shortfall, *C.COMPRESSION_LOUDNESS_SHORTFALL_RANGE_LU)
    # Short-term crest corroborates: if the bars are already dense, the
    # shortfall comes from isolated peaks the limiter should handle.
    micro *= _ramp(profile.short_term_crest_db, 8.0, 14.0) * 0.5 + 0.5
    micro *= 1.0 - 0.6 * profile.transient_health * transient_priority
    micro *= 1.0 - profile.already_limited_score
    if (profile.clipping or {}).get("detected"):
        micro *= 0.7
    # Intent (e.g. 'louder' tag, 'modern' category) scales an EXISTING
    # need; it cannot create one.
    micro = float(np.clip(micro * (1.0 + 0.5 * context.compression_aggression), 0.0, 1.0))

    macro = _ramp(profile.lra_lu, *C.GLUE_LRA_RANGE_LU) * (1.0 - 0.6 * dynamic_priority) * (1.0 - profile.already_limited_score)
    macro = float(np.clip(macro * (1.0 + 0.5 * context.compression_aggression), 0.0, 1.0))
    return {
        "micro_need": round(micro, 3),
        "macro_need": round(macro, 3),
        "inputs": {
            "limiter_only_achievable_lufs": round(achievable, 2),
            "acceptable_min_lufs": context.acceptable_min_lufs,
            "loudness_shortfall_lu": round(shortfall, 2),
            "crest_db": profile.crest_db,
            "short_term_crest_db": profile.short_term_crest_db,
            "lra_lu": profile.lra_lu,
            "plr_db": profile.plr_db,
            "transient_health": profile.transient_health,
            "transient_density": profile.transient_density,
        },
    }
