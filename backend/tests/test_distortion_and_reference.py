"""Added-distortion verdict + bounded reference dynamics."""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pytest
import soundfile as sf

import ai_mastering.mastering as mastering
from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.evaluation.backoff import derive_corrective_plan
from ai_mastering.evaluation.distortion import added_distortion_db
from ai_mastering.evaluation.verdict import build_verdict
from ai_mastering.mastering import master_track
from ai_mastering.output_validation import ValidationResult
from ai_mastering.planning import config as C
from ai_mastering.planning.plan import EQDecision
from ai_mastering.planning.target_model import build_target_context
from ai_mastering.processing.eq import apply_eq
from synthetic import SR, make_mix


@lru_cache(maxsize=None)
def _mix(seed=3, **kw):
    return make_mix(seconds=12.0, seed=seed, **dict(kw))


# ---------------------------------------------------------------------------
# The measure
# ---------------------------------------------------------------------------


def test_linear_processing_reads_as_no_distortion():
    x = _mix()
    eq = apply_eq(x, [EQDecision("high_shelf", 6000.0, 3.0, 0.707, 1.0, "t"), EQDecision("bell", 200.0, -2.5, 1.0, 1.0, "t")], SR)
    assert added_distortion_db(x, x * 2.0, SR)["worst_db"] < -60.0
    assert added_distortion_db(x, eq, SR)["worst_db"] < -40.0


def test_latency_is_aligned_out_not_counted_as_distortion():
    x = _mix()
    delayed = np.concatenate([np.zeros((300, 2), np.float32), x[:-300]])
    d = added_distortion_db(x, delayed, SR)
    assert d["lag_samples"] == 300
    assert d["worst_db"] < -40.0


def test_clipping_and_saturation_are_caught():
    x = _mix()
    x = x / np.max(np.abs(x))
    clipped = np.clip(x * 4.0, -1.0, 1.0)
    soft = np.tanh(x * 1.5)
    assert added_distortion_db(x, clipped, SR)["worst_db"] > C.MAX_ADDED_DISTORTION_DB
    assert added_distortion_db(x, soft, SR)["worst_db"] > added_distortion_db(x, x * 0.9, SR)["worst_db"] + 20.0


# ---------------------------------------------------------------------------
# Verdict + recovery
# ---------------------------------------------------------------------------


class _Ev:
    flags = []
    loudness = {"integrated_lufs": -10.0}
    limiter = {"gr_at_p995_peaks_db": 3.0}
    stage_contributions = {}


def test_distortion_blocks_delivery_and_is_correctable():
    v = build_verdict(_Ev(), {"checks": []}, ValidationResult(passed=True), -10.0, -10.0, distortion={"worst_db": -12.0, "blamed_stage": "saturation"})
    assert not v.passed and v.correctable and v.domains["distortion"] == "fail"
    near = build_verdict(_Ev(), {"checks": []}, ValidationResult(passed=True), -10.0, -10.0, distortion={"worst_db": C.MAX_ADDED_DISTORTION_DB - 1.0})
    assert near.passed and near.domains["distortion"] == "warn"


def test_saturation_blamed_distortion_removes_saturation_before_loudness():
    profile = SourceProfile.from_dict(_analysis_from_audio(_mix(), SR)["source_profile"])
    from ai_mastering.diagnostics.problems import detect_mastering_problems
    from ai_mastering.planning.plan import build_mastering_plan

    ctx = build_target_context(profile.band_layout, "pop", [], "modern", None)
    plan = build_mastering_plan(profile, ctx, detect_mastering_problems(profile, ctx))
    plan.saturation = {"enabled": True, "amount": 0.25, "drive_db": 6.0, "side_drive_scale": 0.3}
    target = plan.loudness["target_lufs"]
    v = build_verdict(_Ev(), {"checks": []}, ValidationResult(passed=True), target, target, distortion={"worst_db": -12.0, "blamed_stage": "saturation"})
    new, actions = derive_corrective_plan(plan, v, _Ev())
    assert not new.saturation["enabled"]
    assert actions[0].startswith("saturation disabled")
    assert new.loudness["target_lufs"] == target


def test_distorting_plan_is_rejected_and_a_clean_master_delivered(tmp_path, monkeypatch):
    src = tmp_path / "in.wav"
    sf.write(str(src), _mix(seed=5, healthy_variation_db=1.0), SR)
    real = mastering.compute_processing_params

    def overdriven(*a, **k):
        params = real(*a, **k)
        params["_plan"].saturation = {"enabled": True, "amount": 0.25, "drive_db": 15.0, "side_drive_scale": 0.3}
        return params

    monkeypatch.setattr(mastering, "compute_processing_params", overdriven)
    result = master_track(str(src), str(tmp_path / "out.wav"), "pop", [])
    diag = result["mastering_diagnostics"]
    assert "distortion:added_distortion" in diag["candidates"][0]["failures"]
    assert diag["verdict"]["passed"]
    assert diag["added_distortion"]["worst_db"] <= C.MAX_ADDED_DISTORTION_DB
    assert not diag["mastering_plan"]["saturation"]["enabled"]


def test_normal_masters_sit_clear_of_the_distortion_limit(tmp_path):
    for name, kw in {"healthy": dict(healthy_variation_db=1.0), "rock": dict(drum_level=1.2), "quiet": dict(lufs=-26.0, section_depth_db=6.0)}.items():
        src = tmp_path / f"{name}.wav"
        sf.write(str(src), _mix(seed=8, **kw), SR)
        result = master_track(str(src), str(tmp_path / f"{name}_out.wav"), "pop", [])
        diag = result["mastering_diagnostics"]
        assert diag["delivered_candidate"] == "initial", (name, diag["candidates"])
        assert diag["added_distortion"]["worst_db"] < C.MAX_ADDED_DISTORTION_DB - 2.0, (name, diag["added_distortion"])


# ---------------------------------------------------------------------------
# Reference dynamics: compare, don't copy
# ---------------------------------------------------------------------------

LAYOUT = SourceProfile.from_dict(_analysis_from_audio(make_mix(seconds=6.0, seed=1), SR)["source_profile"]).band_layout


def _ctx(ref=None, relative=None):
    return build_target_context(LAYOUT, "pop", [], "modern", None, reference_relative_db=relative, reference_dynamics=ref)


def test_no_reference_changes_nothing():
    base = _ctx()
    assert base.reference_dynamics is None and not base.reference_used


@pytest.mark.parametrize("ref_lufs", [-5.0, -24.0])
def test_reference_loudness_informs_but_stays_in_the_genre_window(ref_lufs):
    base, ctx = _ctx(), _ctx({"integrated_lufs": ref_lufs})
    assert base.acceptable_min_lufs - 0.01 <= ctx.preferred_lufs <= base.acceptable_max_lufs + 0.01
    assert np.sign(ctx.preferred_lufs - base.preferred_lufs) == np.sign(ref_lufs - base.preferred_lufs)
    assert ctx.acceptable_min_lufs <= ctx.preferred_lufs - 0.5
    assert "preferred_lufs" in ctx.reference_dynamics["changes"]


def test_reference_crest_and_width_are_bounded_nudges():
    base = _ctx()
    dense = _ctx({"crest_db": base.target_crest_db - 20.0, "stereo_width": base.max_stereo_width - 1.0})
    assert base.target_crest_db - dense.target_crest_db == pytest.approx(C.REFERENCE_CREST_MAX_SHIFT_DB, abs=0.01)
    assert base.max_stereo_width - dense.max_stereo_width == pytest.approx(C.REFERENCE_WIDTH_MAX_LOWER, abs=0.001)
    wide = _ctx({"stereo_width": base.max_stereo_width + 1.0})
    assert wide.max_stereo_width - base.max_stereo_width == pytest.approx(C.REFERENCE_WIDTH_MAX_RAISE, abs=0.001)


def test_reference_bass_shift_is_capped():
    huge_bass = {b["name"]: (25.0 if b["center_hz"] <= 120 else 0.0) for b in LAYOUT}
    ctx = _ctx(relative=huge_bass)
    low = [v for b in LAYOUT for k, v in ctx.reference_shift_db.items() if k == b["name"] and b["center_hz"] <= 120]
    assert low and max(abs(v) for v in low) <= C.REFERENCE_LOW_END_MAX_SHIFT_DB + 1e-6


def test_reference_never_changes_the_sources_transient_budget(tmp_path):
    src = tmp_path / "in.wav"
    sf.write(str(src), _mix(seed=6, drum_level=1.2), SR)
    budgets = {}
    for name, kw in {"loud": dict(lufs=-8.0, limit_db=-6.0), "dynamic": dict(lufs=-20.0, section_depth_db=6.0)}.items():
        ref = tmp_path / f"ref_{name}.wav"
        sf.write(str(ref), _mix(seed=7, **kw), SR)
        result = master_track(str(src), str(tmp_path / f"out_{name}.wav"), "rock", [], reference_track_path=str(ref))
        info = result["processing_applied"]["reference_track"]
        assert info["mode"] == "tonal_and_dynamics_context" and info["dynamics"]["integrated_lufs"] is not None
        plan = result["mastering_diagnostics"]["initial_plan"] or result["mastering_diagnostics"]["mastering_plan"]
        budgets[name] = plan["limiter"]["budget_db"]
        assert result["mastering_diagnostics"]["verdict"]["passed"]
    assert budgets["loud"] == budgets["dynamic"], "reference loudness must not buy more limiting than this source's transients allow"
