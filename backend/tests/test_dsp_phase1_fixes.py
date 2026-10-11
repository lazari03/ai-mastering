"""Regression tests for the DSP Phase 1 fixes (docs/agent-reports/DSP_FIXES.md).
Each test names the defect it pins and failed on the tree before its fix."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.diagnostics.problems import detect_mastering_problems
from ai_mastering.evaluation.backoff import _lower_loudness
from ai_mastering.planning.plan import apply_user_tweaks_to_plan, build_mastering_plan
from ai_mastering.planning.target_model import build_target_context

from synthetic import SR, make_mix

FIXTURES = {
    "healthy": dict(healthy_variation_db=1.0),
    "rock_transient": dict(drum_level=1.2, healthy_variation_db=0.5),
}


@lru_cache(maxsize=None)
def _profile(name: str) -> SourceProfile:
    return SourceProfile.from_dict(_analysis_from_audio(make_mix(seconds=10.0, seed=7, **FIXTURES[name]), SR)["source_profile"])


def _plan(name: str, genre: str, tags=(), category=None, flavour=None, delivery=None, preset_intent=None):
    profile = _profile(name)
    ctx = build_target_context(profile.band_layout, genre, list(tags), "modern", category, flavour, preset_intent=preset_intent, delivery=delivery)
    problems = detect_mastering_problems(profile, ctx)
    return ctx, build_mastering_plan(profile, ctx, problems)


# --- C1 / AURALITH-AUDIO-008: true-peak ceiling follows the planned loudness ----------------


def test_quiet_planned_master_gets_minus_1_dbtp_and_the_same_target():
    ctx, plan = _plan("rock_transient", "rock")
    # Rock's window reaches above -14 LUFS, so the context says -2 dBTP ...
    assert ctx.ceiling_dbtp == -2.0
    # ... but this transient-heavy source is planned below -14 LUFS (crest cap),
    # where -1 dBTP is the delivery rule.
    assert plan.loudness["target_lufs"] <= -14.0
    assert plan.limiter["ceiling_dbtp"] == -1.0
    # The target is NOT recomputed with the extra headroom: it is the value the
    # -2 dBTP budget gave (freed headroom = less limiting, not more loudness).
    lufs, p995 = _profile("rock_transient").integrated_lufs, _profile("rock_transient").peak_p995_db
    achievable_at_context_ceiling = lufs + ctx.ceiling_dbtp + plan.limiter["budget_db"] - p995
    assert abs(plan.loudness["target_lufs"] - round(min(plan.loudness["desired_lufs"], achievable_at_context_ceiling), 2)) < 0.011


def test_loud_planned_master_keeps_minus_2_dbtp():
    _, plan = _plan("healthy", "pop")
    assert plan.loudness["target_lufs"] > -14.0
    assert plan.limiter["ceiling_dbtp"] == -2.0


def test_ceiling_is_rederived_after_loudness_tweak_and_backoff():
    _, plan = _plan("rock_transient", "rock")
    assert plan.limiter["ceiling_dbtp"] == -1.0
    # A loudness tweak that lifts the target above -14 LUFS restores -2 dBTP.
    loud = plan.copy()
    loud.loudness["achievable_lufs_by_budget"] = -12.0
    loud.loudness["desired_lufs"] = -12.0
    apply_user_tweaks_to_plan(loud, {"loudness": 1.0})
    assert loud.loudness["target_lufs"] > -14.0 and loud.limiter["ceiling_dbtp"] == -2.0
    # Backoff lowering a loud plan below -14 LUFS relaxes it to -1 dBTP.
    _, hp = _plan("healthy", "pop")
    hp.loudness["target_lufs"] = -13.8
    _lower_loudness(hp, 1.0, [], "test")
    assert hp.loudness["target_lufs"] <= -14.0 and hp.limiter["ceiling_dbtp"] == -1.0


def test_quiet_genre_window_ceiling_is_never_tightened():
    ctx, plan = _plan("healthy", "pop", delivery="streaming")
    assert ctx.ceiling_dbtp == -1.0 and plan.limiter["ceiling_dbtp"] == -1.0
