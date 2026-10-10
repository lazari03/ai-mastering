"""Bounded Professional comparison of fully verified renders.

Refinement reduces peak processing; it never adds an unmeasured effect.
The original candidate remains available if the trial fails or trades
away tonal correction, loudness, or transient retention.
"""
from __future__ import annotations

import math

from ..planning import config as C


def derive_refinement_plan(plan, evaluation):
    new = plan.copy()
    actions = []
    mb = new.compression.get("multiband", {})
    if mb.get("enabled"):
        for band in mb["bands"].values():
            band["ratio"] = 1.0 + (float(band["ratio"]) - 1.0) * 0.75
            band["max_gain_reduction_db"] *= 0.75
        actions.append("trial: multiband compression reduced 25%")
    glue = new.compression.get("glue", {})
    if glue.get("enabled"):
        glue["ratio"] = 1.0 + (float(glue["ratio"]) - 1.0) * 0.75
        actions.append("trial: glue compression reduced 25%")
    gr = float(evaluation.limiter.get("gr_at_p995_peaks_db", 0.0))
    budget = float(new.limiter["budget_db"])
    if gr > 0.5 and budget > C.LIMITER_BUDGET_MIN_DB:
        new.limiter["budget_db"] = max(C.LIMITER_BUDGET_MIN_DB, budget - 0.5)
        actions.append("trial: limiter budget reduced up to 0.5 dB")
    if not actions:
        return None, []
    # EQ, user controls, target loudness, and delivery ceiling stay intact.
    new.notes.append("Professional measured refinement: gentler peak processing trial")
    new.refresh_expected()
    return new, actions


def refinement_metrics(candidate):
    ev = candidate.evaluation
    return {
        "loudness_shortfall_lu": max(0.0, float(candidate.verdict.loudness["shortfall_vs_requested_lu"])),
        "transient_delta": float(ev.transients["delta"]),
        "short_term_crest_change_db": float(ev.dynamics["short_term_crest_change_db"]),
        "limiter_gr_db": float(ev.limiter["gr_at_p995_peaks_db"]),
        "collateral_db": max((abs(float(v)) for v in ev.collateral_db.values()), default=0.0),
    }


def prefer_refinement(original, trial):
    """Require a measured benefit with bounded, explicit tradeoffs."""
    if not trial.verdict.passed:
        return False, "trial failed final verification"
    a, b = refinement_metrics(original), refinement_metrics(trial)
    if not all(math.isfinite(v) for v in (*a.values(), *b.values())):
        return False, "non-finite comparison measurements"
    if b["loudness_shortfall_lu"] > a["loudness_shortfall_lu"] + 0.3:
        return False, "trial lost more than 0.3 LU of requested loudness"
    if b["transient_delta"] < a["transient_delta"] - 0.005:
        return False, "trial reduced transient retention"
    if b["short_term_crest_change_db"] < a["short_term_crest_change_db"] - 0.1:
        return False, "trial reduced short-term dynamics"
    if b["collateral_db"] > a["collateral_db"] + 0.1:
        return False, "trial increased tonal collateral"
    before = original.evaluation.problem_outcomes
    after = trial.evaluation.problem_outcomes
    if set(after.get("_new_problems_created", {}).get("bands", [])) - set(before.get("_new_problems_created", {}).get("bands", [])):
        return False, "trial created a new tonal problem"
    for name, outcome in before.items():
        if name.startswith("_"):
            continue
        other = after.get(name)
        if other is None or float(other["outside_window_after_db"]) > float(outcome["outside_window_after_db"]) + 0.1:
            return False, "trial weakened a measured tonal correction"
    better = (
        b["transient_delta"] > a["transient_delta"] + 0.005
        or b["short_term_crest_change_db"] > a["short_term_crest_change_db"] + 0.1
        or b["limiter_gr_db"] < a["limiter_gr_db"] - 0.2
    )
    return (True, "verified trial improved transient retention, dynamics or limiter load") if better else (False, "no measurable refinement benefit")
