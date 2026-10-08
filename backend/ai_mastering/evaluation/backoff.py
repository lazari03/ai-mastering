"""Corrective re-renders, derived from what the verdict measured.

Two entry points, both of which only ever REDUCE processing (smaller EQ
moves, less compression, no saturation/clipper, less width, less limiter
drive, a lower loudness target):

* derive_corrective_plan — one corrective step from a failed MasterVerdict.
  Tonal failures are fixed at the stage the evaluator's per-stage
  measurements blame (stage attribution, not generic backoff). Dynamics /
  transient failures walk a relief ladder in the order that costs the
  least loudness: clipper share -> limiter drive -> compression GR ->
  saturation -> target LUFS, each rung sized by the measured overshoot,
  so a -9 LUFS request does not silently come back at -15.
* derive_transparent_plan — the last-resort candidate: limiter/output
  only (plus the user's own tweaks and LF mono safety).

The orchestrator (mastering.py) bounds the total number of renders with
config.MAX_CANDIDATE_RENDERS; there is no open-ended optimisation loop.
`derive_backoff_plan` is the evaluation-flags-only form kept for callers
that have an evaluation but no verdict.
"""

from __future__ import annotations

import numpy as np

from ..planning import config as C
from ..planning.plan import MasteringPlan
from ..processing.eq import band_response_db


def _lower_loudness(plan: MasteringPlan, by_db: float, actions: list, why: str) -> None:
    by_db = float(np.clip(by_db, 0.5, 3.0))
    plan.loudness["target_lufs"] = round(plan.loudness["target_lufs"] - by_db, 2)
    actions.append(f"loudness target lowered {by_db:.2f} dB ({why})")


def _disable(plan: MasteringPlan, stage: str, actions: list, why: str) -> None:
    section = getattr(plan, stage)
    if section.get("enabled"):
        section["enabled"] = False
        section["disabled_by_backoff"] = why
        actions.append(f"{stage} disabled ({why})")


def _soften_compression(plan: MasteringPlan, actions: list, why: str, bands: tuple[str, ...] | None = None) -> None:
    mb = plan.compression.get("multiband", {})
    if mb.get("enabled"):
        for name, cfg in mb["bands"].items():
            if bands is None or name in bands:
                cfg["ratio"] = round(1.0 + (cfg["ratio"] - 1.0) * 0.5, 3)
                cfg["max_gain_reduction_db"] = round(cfg["max_gain_reduction_db"] * 0.5, 3)
        actions.append(f"multiband compression halved{' on ' + ','.join(bands) if bands else ''} ({why})")
    if bands is None and plan.compression.get("glue", {}).get("enabled"):
        g = plan.compression["glue"]
        g["ratio"] = round(1.0 + (g["ratio"] - 1.0) * 0.5, 3)
        actions.append(f"glue compression halved ({why})")


def _scale_eq(plan: MasteringPlan, lo: float, hi: float, sign: int, factor: float, actions: list, why: str, drop_below_conf: float = 0.0) -> None:
    for d in plan.eq_decisions:
        if d.source != "automatic" or np.sign(d.gain_db) != sign:
            continue
        resp = band_response_db([d], plan.band_layout, plan.sample_rate)
        hits = [v for b in plan.band_layout if lo <= b["center_hz"] < hi for v in [resp[b["name"]]] if abs(v) > 0.2]
        if not hits:
            continue
        old = d.gain_db
        d.gain_db = 0.0 if d.confidence < drop_below_conf else d.gain_db * factor
        d.notes.append(f"backoff: {old:+.2f} -> {d.gain_db:+.2f} dB ({why})")
        actions.append(f"EQ {d.filter_type} @ {d.frequency_hz:.0f} Hz {old:+.2f} -> {d.gain_db:+.2f} dB ({why})")


def _apply_flag(new: MasteringPlan, f: dict, actions: list, state: dict) -> None:
    """Reduce the stage an evaluation-style flag blames."""
    kind, stage = f["kind"], f.get("blamed_stage")
    why = f"{kind}: {f['detail']}"
    if kind == "low_end_loss":
        if stage == "eq":
            _scale_eq(new, *C.LOW_END_PROTECT_RANGE_HZ, -1, 0.5, actions, why)
        elif stage in ("multiband_compression", "glue_compression"):
            _soften_compression(new, actions, why, ("sub", "low", "punch") if stage == "multiband_compression" else None)
        elif stage == "saturation":
            _disable(new, "saturation", actions, why)
        else:
            _disable(new, "clipper", actions, why)
            if not state["lowered"]:
                _lower_loudness(new, abs(f["measured"]) - C.LOW_END_COLLATERAL_TOLERANCE_DB + 0.5, actions, why)
                state["lowered"] = True
    elif kind == "hf_growth":
        if stage == "eq":
            _scale_eq(new, 4000.0, 30000.0, 1, 0.5, actions, why, drop_below_conf=0.9)
        elif stage == "saturation":
            _disable(new, "saturation", actions, why)
        elif stage in ("multiband_compression", "glue_compression"):
            _soften_compression(new, actions, why)
        else:
            _disable(new, "clipper", actions, why)
            _disable(new, "saturation", actions, why)
    elif kind == "band_collateral":
        if stage == "eq":
            for d in new.eq_decisions:
                if d.source == "automatic":
                    d.gain_db *= 0.5
            actions.append(f"all automatic EQ halved ({why})")
        elif stage == "saturation":
            _disable(new, "saturation", actions, why)
        elif stage in ("multiband_compression", "glue_compression", "dynamic_eq", "deesser"):
            _soften_compression(new, actions, why)
            for d in new.dynamic_eq_decisions:
                d.max_reduction_db *= 0.5
            if new.deesser.get("enabled"):
                new.deesser["strength"] = round(new.deesser["strength"] * 0.5, 3)
        elif stage == "stereo":
            new.stereo["side_gain_db"] = 0.0
            new.stereo["side_high_shelf_db"] = 0.0
            actions.append(f"width processing removed ({why})")
        else:
            _disable(new, "clipper", actions, why)
            if not state["lowered"]:
                _lower_loudness(new, 1.0, actions, why)
                state["lowered"] = True
    elif kind in ("limiter_over_budget", "crest_collapse", "transient_loss", "lra_collapse"):
        _disable(new, "clipper", actions, why)
        if kind in ("lra_collapse", "transient_loss") and new.compression.get("enabled"):
            _soften_compression(new, actions, why)
        if not state["lowered"]:
            over = f["measured"] - f["limit"] if kind in ("limiter_over_budget", "crest_collapse") else 1.5
            _lower_loudness(new, abs(over), actions, why)
            state["lowered"] = True
    elif kind == "unsafe_correlation":
        new.stereo["side_gain_db"] = min(0.0, new.stereo.get("side_gain_db", 0.0))
        new.stereo["side_high_shelf_db"] = 0.0
        new.stereo["user_side_gain_db"] = min(0.0, new.stereo.get("user_side_gain_db", 0.0))
        actions.append(f"widening removed ({why})")


def derive_backoff_plan(plan: MasteringPlan, evaluation) -> tuple[MasteringPlan | None, list[str]]:
    significant = [f for f in evaluation.flags if f["severity"] >= C.BACKOFF_MIN_SEVERITY and f["kind"] not in ("true_peak_over_ceiling", "clipping")]
    if not significant:
        return None, []
    new = plan.copy()
    actions: list[str] = []
    state = {"lowered": False}
    for f in significant:
        _apply_flag(new, f, actions, state)
    if not actions:
        return None, []
    new.eq_decisions = [d for d in new.eq_decisions if abs(d.gain_db) >= 1e-3]
    new.refresh_expected()
    new.backoff = {"triggered_by": significant, "actions": actions}
    return new, actions


# ---------------------------------------------------------------------------
# Verdict-driven correction
# ---------------------------------------------------------------------------

# Stages a tonal failure can be pinned on and reduced individually. A
# tonal failure blamed on the bus (clipper/limiter), or on nothing, is a
# dynamics problem in disguise and goes to the relief ladder instead.
_TONAL_STAGES = ("eq", "multiband_compression", "glue_compression", "saturation", "dynamic_eq", "deesser", "stereo")

# Guardrail / QC kinds expressed as the evaluation kind whose handler fixes them.
_AS_EVAL_KIND = {
    "high_frequency_boost": "hf_growth",
    "excessive_band_change": "band_collateral",
    "phase_correlation": "unsafe_correlation",
}


def _attribute(issue, contributions: dict) -> str | None:
    """Pin a guardrail tonal failure on a render stage using the evaluator's
    per-stage measurements. A failure on TOTAL movement (absolute cap) is
    the plan's own EQ: unplanned contributions exclude it by definition."""
    if getattr(issue, "basis", "unplanned") == "total":
        return "eq"
    if issue.kind in ("high_frequency_boost",) or (issue.kind == "tilt_drift" and float(issue.measured or 0.0) > 0):
        key, sign = "hf_db", 1.0
    elif issue.kind in ("low_end_loss",) or issue.kind == "tilt_drift":
        key, sign = "low_end_db", -1.0
    else:
        key, sign = None, 1.0
    best, best_val = None, 0.0
    for stage, c in contributions.items():
        if key is None:
            v = max((abs(x) for x in c.get("unexpected_band_change_db", {}).values()), default=0.0)
        else:
            v = float(c.get(key, 0.0)) * sign
        if v > best_val:
            best, best_val = stage, v
    return best


def _issue_as_flag(issue, contributions: dict) -> dict:
    kind = _AS_EVAL_KIND.get(issue.kind, issue.kind)
    if issue.kind == "tilt_drift":
        kind = "hf_growth" if float(issue.measured or 0.0) > 0 else "low_end_loss"
    stage = issue.blamed_stage if issue.source == "evaluation" else _attribute(issue, contributions)
    return {"kind": kind, "measured": issue.measured if issue.measured is not None else 0.0, "limit": issue.limit if issue.limit is not None else 0.0, "blamed_stage": stage, "detail": f"[{issue.source}] {issue.detail}"}


def _relief_ladder(plan: MasteringPlan, relief_db: float, gr_p995_db: float, first: tuple[str, ...], actions: list, why: str) -> float:
    """Free `relief_db` of peak reduction, cheapest-in-loudness first.
    Returns the relief still unaccounted for (0 when covered)."""
    remaining = float(relief_db)
    order = list(dict.fromkeys([*first, "clipper", "limiter", "compression", "saturation"]))
    for rung in order:
        if remaining <= 0.05:
            break
        if rung == "clipper" and plan.clipper.get("enabled"):
            share = float(plan.clipper.get("share_db", 0.0))
            _disable(plan, "clipper", actions, why)
            plan.clipper["share_db"] = 0.0
            remaining -= share
        elif rung == "limiter":
            # Lowering the limiter budget below the GR the last render
            # actually took makes the renderer cap its gain push by exactly
            # the difference — the loudness drops only as far as needed.
            budget = float(plan.limiter["budget_db"])
            new_budget = float(np.clip(min(budget, gr_p995_db) - remaining, C.LIMITER_BUDGET_MIN_DB, budget))
            freed = min(budget, gr_p995_db) - new_budget
            if budget - new_budget >= 0.1 and freed > 0.0:
                plan.limiter["budget_db"] = round(new_budget, 3)
                actions.append(f"limiter drive reduced: budget {budget:.2f} -> {new_budget:.2f} dB ({why})")
                remaining -= freed
        elif rung == "compression" and plan.compression.get("enabled"):
            mb = plan.compression.get("multiband", {})
            est = 0.5 * float(np.mean([b["max_gain_reduction_db"] for b in mb["bands"].values()])) if mb.get("enabled") else 0.5
            _soften_compression(plan, actions, why)
            remaining -= est
        elif rung == "saturation" and plan.saturation.get("enabled"):
            est = 0.5 * float(plan.saturation.get("drive_db", 0.0))
            _disable(plan, "saturation", actions, why)
            remaining -= est
    return max(remaining, 0.0)


def derive_corrective_plan(plan: MasteringPlan, verdict, evaluation) -> tuple[MasteringPlan | None, list[str]]:
    """One corrective step from a failed verdict, or (None, []) when there
    is nothing left that reducing processing could plausibly fix."""
    if verdict.passed or not verdict.correctable:
        return None, []
    new = plan.copy()
    actions: list[str] = []
    contributions = getattr(evaluation, "stage_contributions", {}) or {}

    relief = 0.0
    relief_first: list[str] = []
    relief_why: list[str] = []
    state = {"lowered": True}  # loudness is only ever lowered by the ladder below
    for issue in verdict.failures:
        if issue.domain in ("tonal", "stereo"):
            flag = _issue_as_flag(issue, contributions)
            if flag["kind"] == "unsafe_correlation" or flag["blamed_stage"] in _TONAL_STAGES:
                _apply_flag(new, flag, actions, state)
            else:
                relief = max(relief, C.RECOVERY_NOMINAL_RELIEF_DB)
                relief_why.append(f"{issue.kind} blamed on {flag['blamed_stage'] or 'the bus'}")
        elif issue.domain in ("dynamics", "transients"):
            relief = max(relief, float(issue.relief_db))
            relief_why.append(f"{issue.kind}: {issue.detail}")
            if issue.blamed_stage in ("multiband_compression", "glue_compression"):
                relief_first.append("compression")
        elif issue.domain == "distortion":
            # Nonlinear stages first (they make harmonics by design), then
            # the limiter's drive; loudness only for what's still missing.
            relief = max(relief, float(issue.relief_db))
            relief_why.append(f"{issue.kind}: {issue.detail}")
            relief_first.extend(["saturation", "clipper"] if issue.blamed_stage == "saturation" else ["clipper", "saturation"])
        elif issue.kind == "loudness_target_missed" and issue.measured is not None and issue.limit is not None and float(issue.measured) < float(issue.limit):
            # The chain could not reach its own effective target: aim at
            # what it measurably can, instead of pushing the limiter harder.
            _lower_loudness(new, float(issue.limit) - float(issue.measured), actions, issue.detail)

    if relief > 0.0:
        why = "; ".join(relief_why)[:300]
        gr = float(getattr(evaluation, "limiter", {}).get("gr_at_p995_peaks_db", new.limiter["budget_db"]))
        remaining = _relief_ladder(new, relief, gr, tuple(relief_first), actions, why)
        if remaining > 0.05:
            _lower_loudness(new, remaining, actions, why)

    if not actions:
        return None, []
    new.eq_decisions = [d for d in new.eq_decisions if abs(d.gain_db) >= 1e-3]
    new.refresh_expected()
    new.backoff = {"triggered_by": [f.kind for f in verdict.failures], "actions": actions}
    return new, actions


def derive_transparent_plan(plan: MasteringPlan, verdict=None, evaluation=None) -> tuple[MasteringPlan, list[str]]:
    """Last-resort candidate: what an engineer does when every corrective
    move still damages the track — gain and limiting only. Keeps the
    user's explicit tweaks and LF-mono (a safety move, not colour), drops
    every automatic colouring stage, and carries forward any limiter /
    loudness reduction already found necessary (`plan` is the most
    corrected plan so far)."""
    new = plan.copy()
    actions = ["transparent fallback: automatic EQ, dynamic EQ, compression, de-esser, saturation, clipper and widening removed"]
    new.eq_decisions = [d for d in new.eq_decisions if d.source != "automatic"]
    new.dynamic_eq_decisions = []
    new.compression["enabled"] = False
    for key in ("multiband", "glue"):
        if isinstance(new.compression.get(key), dict):
            new.compression[key]["enabled"] = False
    new.deesser["enabled"] = False
    new.saturation["enabled"] = False
    new.clipper["enabled"] = False
    new.clipper["share_db"] = 0.0
    new.stereo["side_gain_db"] = 0.0
    new.stereo["side_high_shelf_db"] = 0.0
    new.stereo["enabled"] = bool(new.stereo.get("lf_mono", {}).get("enabled") or abs(float(new.stereo.get("user_side_gain_db", 0.0))) > 1e-3)
    if verdict is not None and evaluation is not None:
        relief = max((float(f.relief_db) for f in verdict.failures if f.domain in ("dynamics", "transients", "distortion")), default=0.0)
        if relief > 0.0:
            gr = float(getattr(evaluation, "limiter", {}).get("gr_at_p995_peaks_db", new.limiter["budget_db"]))
            remaining = _relief_ladder(new, relief, gr, (), actions, "transparent fallback")
            if remaining > 0.05:
                _lower_loudness(new, remaining, actions, "transparent fallback")
    new.refresh_expected()
    new.backoff = {"triggered_by": [f.kind for f in verdict.failures] if verdict is not None else [], "actions": actions, "transparent": True}
    return new, actions
