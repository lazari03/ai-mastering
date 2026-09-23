"""One conservative corrective re-render, derived from the evaluation.

Bounded by construction: `derive_backoff_plan` is called at most
config.MAX_BACKOFF_RENDERS times by the orchestrator, every action only
ever REDUCES processing (smaller EQ moves, less compression, no
saturation/clipper, less width, a lower loudness target), and the caller
keeps whichever render evaluates better. No optimisation loop.
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


def derive_backoff_plan(plan: MasteringPlan, evaluation) -> tuple[MasteringPlan | None, list[str]]:
    significant = [f for f in evaluation.flags if f["severity"] >= C.BACKOFF_MIN_SEVERITY and f["kind"] not in ("true_peak_over_ceiling", "clipping")]
    if not significant:
        return None, []
    new = plan.copy()
    actions: list[str] = []
    lowered = False
    for f in significant:
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
                if not lowered:
                    _lower_loudness(new, abs(f["measured"]) - C.LOW_END_COLLATERAL_TOLERANCE_DB + 0.5, actions, why)
                    lowered = True
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
                if not lowered:
                    _lower_loudness(new, 1.0, actions, why)
                    lowered = True
        elif kind in ("limiter_over_budget", "crest_collapse", "transient_loss", "lra_collapse"):
            _disable(new, "clipper", actions, why)
            if kind in ("lra_collapse", "transient_loss") and new.compression.get("enabled"):
                _soften_compression(new, actions, why)
            if not lowered:
                over = f["measured"] - f["limit"] if kind in ("limiter_over_budget", "crest_collapse") else 1.5
                _lower_loudness(new, abs(over), actions, why)
                lowered = True
        elif kind == "unsafe_correlation":
            new.stereo["side_gain_db"] = min(0.0, new.stereo.get("side_gain_db", 0.0))
            new.stereo["side_high_shelf_db"] = 0.0
            new.stereo["user_side_gain_db"] = min(0.0, new.stereo.get("user_side_gain_db", 0.0))
            actions.append(f"widening removed ({why})")
    if not actions:
        return None, []
    new.eq_decisions = [d for d in new.eq_decisions if abs(d.gain_db) >= 1e-3]
    new.refresh_expected()
    new.backoff = {"triggered_by": significant, "actions": actions}
    return new, actions
