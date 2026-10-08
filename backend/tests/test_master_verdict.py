"""The final verification layer is AUTHORITATIVE.

* evaluation, QC and guardrails fold into one MasterVerdict;
* no WAV exists until a candidate's verdict passes;
* the total number of renders is bounded by one global budget;
* dynamics failures are relieved stage by stage (clipper -> limiter drive
  -> compression -> saturation -> target) before loudness is given up;
* corpus-level regression for the historical "highs up / bass down"
  defect: every delivered master stays inside unplanned low-end, HF and
  tilt-drift limits.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pytest
import soundfile as sf

import ai_mastering.mastering as mastering
from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio
from ai_mastering.band_levels import BAND_EDGES_HZ
from ai_mastering.diagnostics.problems import detect_mastering_problems
from ai_mastering.evaluation.backoff import derive_corrective_plan, derive_transparent_plan
from ai_mastering.evaluation.verdict import VerdictIssue, build_verdict, MasterVerdict
from ai_mastering.mastering import master_track
from ai_mastering.output_validation import GuardrailConfig, ValidationResult, GuardrailFailure, unplanned_tilt_db_per_oct, validate_render
from ai_mastering.planning import config as C
from ai_mastering.planning.plan import build_mastering_plan
from ai_mastering.planning.target_model import build_target_context
from ai_mastering.quality_control import InvalidAudioError

from synthetic import SR, make_mix

ZERO = {b: 0.0 for b in BAND_EDGES_HZ}


def _guard(**over):
    args = dict(band_deltas_db=dict(ZERO), true_peak_dbtp=-1.2, rendered_lufs=-10.0, target_lufs=-10.0, transient_delta=0.0)
    args.update(over)
    return validate_render(**args)


# ---------------------------------------------------------------------------
# Guardrails: plan-aware, with absolute caps and tilt drift
# ---------------------------------------------------------------------------


def test_planned_low_cut_is_not_damage_but_the_same_cut_unplanned_is():
    deltas = {**ZERO, "kick_bass_60_120hz": -2.8, "upper_bass_120_250hz": -2.4}
    assert not _guard(band_deltas_db=deltas).passed
    planned = {**ZERO, "kick_bass_60_120hz": -2.6, "upper_bass_120_250hz": -2.3}
    assert _guard(band_deltas_db=deltas, planned_deltas_db=planned).passed


def test_absolute_cap_holds_even_when_the_plan_asked_for_it():
    """A runaway plan cannot excuse itself by planning the damage."""
    deltas = {**ZERO, "high_6000_20000hz": 5.0}
    r = _guard(band_deltas_db=deltas, planned_deltas_db=dict(deltas))
    assert not r.passed
    assert {f.basis for f in r.failures} == {"total"}
    # ...but an explicit user request is not a planner error.
    assert _guard(band_deltas_db=deltas, planned_deltas_db=dict(deltas), user_deltas_db=dict(deltas)).passed


def test_tilt_drift_catches_small_highs_up_plus_bass_down():
    """Each band inside its own limit, together an audible tilt — the
    combination the engine historically produced."""
    deltas = {**ZERO, "sub_bass_35_60hz": -1.6, "kick_bass_60_120hz": -1.5, "upper_bass_120_250hz": -0.8, "presence_4000_6000hz": 1.5, "high_6000_20000hz": 2.0}
    cfg = GuardrailConfig()
    assert all(-cfg.max_low_end_loss_db <= deltas[b] for b in ("sub_bass_35_60hz", "kick_bass_60_120hz"))
    assert deltas["high_6000_20000hz"] <= cfg.max_high_boost_db
    assert unplanned_tilt_db_per_oct(deltas) > cfg.max_tilt_drift_db_per_oct
    r = _guard(band_deltas_db=deltas)
    assert [f.name for f in r.failures] == ["tilt_drift"]


# ---------------------------------------------------------------------------
# One verdict over three checkers
# ---------------------------------------------------------------------------


class _Ev:
    def __init__(self, flags=(), lufs=-10.0, gr=3.0, contributions=None):
        self.flags = list(flags)
        self.loudness = {"integrated_lufs": lufs}
        self.limiter = {"gr_at_p995_peaks_db": gr}
        self.stage_contributions = contributions or {}


def _qc(*checks):
    return {"checks": [{"id": i, "status": s, "message": i, "value": v} for i, s, v in checks]}


def test_verdict_fails_when_any_one_checker_fails():
    ok_ev, ok_qc, ok_g = _Ev(), _qc(("true_peak", "pass", -1.2)), ValidationResult(passed=True)
    assert build_verdict(ok_ev, ok_qc, ok_g, -10.0, -10.0).passed
    g_fail = ValidationResult(passed=False, failures=[GuardrailFailure("low_end_loss", -3.0, -2.0, "kick_bass_60_120hz", "eq_low_shelf_and_highpass", "x")])
    v = build_verdict(ok_ev, ok_qc, g_fail, -10.0, -10.0)
    assert not v.passed and v.domains["tonal"] == "fail" and v.failures[0].source == "guardrail"
    v = build_verdict(ok_ev, _qc(("plr", "fail", 3.0)), ok_g, -10.0, -10.0)
    assert not v.passed and v.domains["dynamics"] == "fail"
    assert v.failures[0].relief_db == pytest.approx(1.0 + C.RECOVERY_RELIEF_MARGIN_DB)
    ev_fail = _Ev(flags=[{"kind": "hf_growth", "measured": 2.0, "limit": 1.0, "severity": 0.6, "blamed_stage": "saturation", "detail": "x"}])
    assert not build_verdict(ev_fail, ok_qc, ok_g, -10.0, -10.0).passed


def test_qc_warnings_and_loudness_shortfall_warn_but_do_not_block():
    v = build_verdict(_Ev(lufs=-13.0), _qc(("plr", "warn", 5.0)), ValidationResult(passed=True), requested_target_lufs=-9.0, effective_target_lufs=-13.0)
    assert v.passed
    kinds = {w.kind for w in v.warnings}
    assert {"plr", "loudness_below_request"} <= kinds
    assert v.loudness["shortfall_vs_requested_lu"] == pytest.approx(4.0)


def test_uncorrectable_failures_are_not_retried():
    v = build_verdict(_Ev(), _qc(("output_silence", "fail", -90.0)), ValidationResult(passed=True), -10.0, -10.0)
    assert not v.passed and not v.correctable


# ---------------------------------------------------------------------------
# Stage-specific recovery ladder
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def _plan(offsets=None, lufs=-18.0):
    audio = make_mix(seconds=12.0, seed=5, offsets_db=offsets, lufs=lufs)
    profile = SourceProfile.from_dict(_analysis_from_audio(audio, SR)["source_profile"])
    ctx = build_target_context(profile.band_layout, "pop", [], "modern", None)
    return build_mastering_plan(profile, ctx, detect_mastering_problems(profile, ctx))


def _dyn_verdict(relief_db, kind="limiter_over_budget", blamed="bus"):
    issue = VerdictIssue("evaluation", kind, "dynamics", 0.0, 0.0, blamed, "forced", relief_db=relief_db)
    return MasterVerdict(passed=False, failures=[issue])


def test_ladder_spends_clipper_share_before_any_loudness():
    plan = _plan().copy()
    plan.clipper = {"enabled": True, "share_db": 1.0}
    target = plan.loudness["target_lufs"]
    new, actions = derive_corrective_plan(plan, _dyn_verdict(0.8), _Ev(gr=plan.limiter["budget_db"] + 1.0))
    assert not new.clipper["enabled"]
    assert new.loudness["target_lufs"] == target
    assert new.limiter["budget_db"] == plan.limiter["budget_db"]
    assert actions and actions[0].startswith("clipper disabled")


def test_ladder_reduces_limiter_drive_before_lowering_the_target():
    plan = _plan().copy()
    plan.clipper = {"enabled": False, "share_db": 0.0}
    plan.limiter["budget_db"] = 4.0
    target = plan.loudness["target_lufs"]
    new, actions = derive_corrective_plan(plan, _dyn_verdict(1.5), _Ev(gr=4.0))
    assert new.limiter["budget_db"] == pytest.approx(2.5)
    assert new.loudness["target_lufs"] == target, "limiter drive covered the relief; target must not move"
    # Only when every stage is exhausted does the target come down, and
    # only by what is still missing — never a blind -2/-4/-6 dB.
    plan.limiter["budget_db"] = C.LIMITER_BUDGET_MIN_DB
    new, actions = derive_corrective_plan(plan, _dyn_verdict(1.5), _Ev(gr=C.LIMITER_BUDGET_MIN_DB))
    assert target - new.loudness["target_lufs"] == pytest.approx(1.5, abs=0.01)


def test_compression_blamed_failure_softens_compression_first():
    plan = _plan(lufs=-24.0).copy()
    plan.compression = {
        "enabled": True,
        "multiband": {"enabled": True, "bands": {"low": {"ratio": 2.0, "max_gain_reduction_db": 4.0}}},
        "glue": {"enabled": False},
    }
    new, actions = derive_corrective_plan(plan, _dyn_verdict(1.5, kind="transient_loss", blamed="multiband_compression"), _Ev(gr=plan.limiter["budget_db"]))
    assert "compression" in actions[0]
    assert new.compression["multiband"]["bands"]["low"]["ratio"] == pytest.approx(1.5)


def test_transparent_plan_is_limiter_and_user_moves_only():
    plan = _plan(offsets=((40, 250, 6.5),)).copy()
    assert any(d.source == "automatic" for d in plan.eq_decisions)
    new, _ = derive_transparent_plan(plan)
    assert all(d.source != "automatic" for d in new.eq_decisions)
    assert not new.compression["enabled"] and not new.saturation["enabled"] and not new.clipper["enabled"]
    assert new.dynamic_eq_decisions == [] and not new.deesser["enabled"]


# ---------------------------------------------------------------------------
# Orchestration: authoritative verdict, write-after-pass, render budget
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def source(tmp_path_factory):
    path = tmp_path_factory.mktemp("verdict") / "in.wav"
    sf.write(str(path), make_mix(seconds=12.0, seed=7, healthy_variation_db=1.0), SR)
    return path


def _count_renders(monkeypatch):
    calls = {"n": 0}
    real = mastering.render_plan

    def counting(*a, **k):
        calls["n"] += 1
        return real(*a, **k)

    monkeypatch.setattr(mastering, "render_plan", counting)
    return calls


def test_guardrail_failure_triggers_a_corrective_render_before_anything_is_written(source, tmp_path, monkeypatch):
    real = mastering.validate_render
    seen = {"n": 0, "out_existed": []}
    out = tmp_path / "out.wav"

    def failing_first(**kw):
        seen["n"] += 1
        seen["out_existed"].append(out.exists())
        r = real(**kw)
        if seen["n"] == 1:
            r.failures.append(GuardrailFailure("tilt_drift", 0.6, 0.3, None, "eq_high_shelf_and_saturation", "forced"))
            r.passed = False
        return r

    monkeypatch.setattr(mastering, "validate_render", failing_first)
    result = master_track(str(source), str(out), "pop", [])
    diag = result["mastering_diagnostics"]
    assert not any(seen["out_existed"]), "a WAV existed before the final verdict"
    assert diag["renders"] >= 2 and diag["backoff_applied"]
    assert diag["initial_verdict"]["passed"] is False
    assert diag["verdict"]["passed"] is True
    assert result["level_diagnostics"]["guardrails"]["passed"] is True
    assert out.exists()


def test_no_passing_candidate_means_no_file_and_bounded_renders(source, tmp_path, monkeypatch):
    calls = _count_renders(monkeypatch)
    real = mastering.validate_render

    def always_fail(**kw):
        r = real(**kw)
        r.failures.append(GuardrailFailure("tilt_drift", 0.9, 0.3, None, "eq_high_shelf_and_saturation", "forced"))
        r.passed = False
        return r

    monkeypatch.setattr(mastering, "validate_render", always_fail)
    out = tmp_path / "out.wav"
    with pytest.raises(InvalidAudioError, match="no master was delivered"):
        master_track(str(source), str(out), "pop", [])
    assert not out.exists()
    assert 1 <= calls["n"] <= C.MAX_CANDIDATE_RENDERS


def test_dynamics_qc_failure_recovers_without_a_blind_six_db_drop(source, tmp_path, monkeypatch):
    calls = _count_renders(monkeypatch)
    real = mastering.run_quality_control
    state = {"n": 0}

    def plr_fails_once(**kw):
        state["n"] += 1
        qc = real(**kw)
        if state["n"] == 1:
            qc["checks"].insert(0, {"id": "plr", "status": "fail", "message": "forced", "value": 3.5})
            qc["passed"] = False
        return qc

    monkeypatch.setattr(mastering, "run_quality_control", plr_fails_once)
    result = master_track(str(source), str(tmp_path / "out.wav"), "pop", [])
    diag = result["mastering_diagnostics"]
    assert diag["delivered_candidate"] == "corrective_1"
    first, delivered = diag["candidates"][0], diag["candidates"][-1]
    # Relief asked for: 0.5 dB PLR + margin. A clipper/limiter rung covers
    # it, so the delivered master is not ~6 dB quieter than the first.
    assert first["integrated_lufs"] - delivered["integrated_lufs"] < 1.5
    assert calls["n"] <= C.MAX_CANDIDATE_RENDERS


def test_every_reported_field_comes_from_the_delivered_candidate(source, tmp_path, monkeypatch):
    real = mastering.run_quality_control
    state = {"n": 0}

    def fail_once(**kw):
        state["n"] += 1
        qc = real(**kw)
        if state["n"] == 1:
            qc["checks"].insert(0, {"id": "limiter_gain_reduction", "status": "fail", "message": "forced", "value": 7.0})
            qc["passed"] = False
        return qc

    monkeypatch.setattr(mastering, "run_quality_control", fail_once)
    result = master_track(str(source), str(tmp_path / "out.wav"), "pop", [])
    diag = result["mastering_diagnostics"]
    plan = diag["mastering_plan"]
    assert result["quality_control"]["passed"]
    assert result["target_profile_used"]["target_lufs"] == plan["loudness"]["target_lufs"]
    assert result["processing_applied"]["limiter"]["budget_db"] == plan["limiter"]["budget_db"]
    assert diag["evaluation"]["limiter"]["gr_at_p995_peaks_db"] == result["processing_applied"]["limiter"]["gr_at_p995_peaks_db"]
    assert diag["verdict"]["loudness"]["integrated_lufs"] == pytest.approx(result["analysis_after"]["integrated_lufs"], abs=0.01)


# ---------------------------------------------------------------------------
# Corpus-level regression: the "highs up / bass down" defect
# ---------------------------------------------------------------------------

CORPUS = {
    "healthy": dict(healthy_variation_db=1.0),
    "bass_heavy": dict(offsets_db=[(40, 250, 6.5)]),
    "thin": dict(offsets_db=[(40, 300, -7.0)]),
    "dark": dict(offsets_db=[(3000, 20000, -7.5)]),
    "bright_harsh": dict(offsets_db=[(2500, 9000, 6.5)]),
    "regression": dict(offsets_db=[(140, 450, 6.0), (5500, 10000, 4.0), (14000, 20000, -5.0)]),
    "rock_transient": dict(drum_level=1.2, healthy_variation_db=0.5),
    "already_limited": dict(lufs=-9.0, limit_db=-6.0),
    "quiet_dynamic": dict(lufs=-26.0, section_depth_db=6.0, drum_level=1.0),
}
# Acceptance limits for UNPLANNED movement on the delivered master
# (loudness-matched, planned static EQ removed). The guardrails enforce the
# same quantities; this pins them so a future limit change is a visible,
# reviewed decision rather than a silent regression.
LOW_END_UNPLANNED_MIN_DB = -1.5
HF_UNPLANNED_MAX_DB = 1.5
TILT_DRIFT_MAX_DB_PER_OCT = 0.3


@pytest.mark.parametrize("tier", ["standard", "professional"])
@pytest.mark.parametrize("name", sorted(CORPUS))
def test_corpus_never_brightens_or_thins_beyond_plan(tmp_path, name, tier):
    src = tmp_path / "in.wav"
    sf.write(str(src), make_mix(seconds=14.0, seed=21, **CORPUS[name]), SR)
    result = master_track(str(src), str(tmp_path / "out.wav"), "pop", [], tier=tier)
    lvl = result["level_diagnostics"]
    measured, planned = lvl["loudness_matched_band_deltas_db"], lvl["planned_band_deltas_db"]
    unplanned = {b: measured[b] - planned[b] for b in measured}
    for b in ("sub_bass_35_60hz", "kick_bass_60_120hz"):
        assert unplanned[b] >= LOW_END_UNPLANNED_MIN_DB, (name, tier, b, unplanned)
    for b in ("presence_4000_6000hz", "high_6000_20000hz"):
        assert unplanned[b] <= HF_UNPLANNED_MAX_DB, (name, tier, b, unplanned)
    assert abs(unplanned_tilt_db_per_oct(measured, planned)) <= TILT_DRIFT_MAX_DB_PER_OCT, (name, tier, unplanned)
    ev = result["mastering_diagnostics"]["evaluation"]
    assert ev["regions"]["low_end_40_120"]["collateral_db"] >= -C.LOW_END_COLLATERAL_TOLERANCE_DB
    assert ev["regions"]["hf_4k_14k"]["collateral_db"] <= C.HF_COLLATERAL_TOLERANCE_DB
    assert result["mastering_diagnostics"]["verdict"]["passed"]
    assert result["mastering_diagnostics"]["renders"] <= C.MAX_CANDIDATE_RENDERS


def test_injected_brightening_stage_is_caught_and_not_delivered(source, tmp_path, monkeypatch):
    """Simulate the historical defect inside the engine: a plan that pushes
    the highs up and the bass down far past what the planner allows. The
    verdict must reject it and the delivered master must not carry it."""
    from ai_mastering.planning.plan import EQDecision

    real_compute = mastering.compute_processing_params

    def sabotaged(*a, **k):
        params = real_compute(*a, **k)
        plan = params["_plan"]
        plan.eq_decisions.append(EQDecision("high_shelf", 5000.0, 5.0, 0.707, 0.95, "injected_fault"))
        plan.eq_decisions.append(EQDecision("low_shelf", 110.0, -5.5, 0.707, 0.95, "injected_fault"))
        plan.refresh_expected()
        return params

    monkeypatch.setattr(mastering, "compute_processing_params", sabotaged)
    result = master_track(str(source), str(tmp_path / "out.wav"), "pop", [])
    diag = result["mastering_diagnostics"]
    assert diag["initial_verdict"]["passed"] is False
    assert any(f["basis"] == "total" for f in diag["initial_verdict"]["failures"] if f["source"] == "guardrail")
    assert diag["verdict"]["passed"]
    measured = result["level_diagnostics"]["loudness_matched_band_deltas_db"]
    assert measured["high_6000_20000hz"] <= GuardrailConfig().absolute_max_high_boost_db
    assert measured["kick_bass_60_120hz"] >= -GuardrailConfig().absolute_max_low_end_loss_db


def test_transparent_fallback_is_surfaced_not_buried(source, tmp_path, monkeypatch):
    real = mastering.validate_render
    calls = {"n": 0}

    def fail_until_fallback(**kw):
        calls["n"] += 1
        r = real(**kw)
        if calls["n"] < C.MAX_CANDIDATE_RENDERS:
            r.failures.append(GuardrailFailure("tilt_drift", 0.9, 0.3, None, "eq_high_shelf_and_saturation", "forced"))
            r.passed = False
        return r

    monkeypatch.setattr(mastering, "validate_render", fail_until_fallback)
    result = master_track(str(source), str(tmp_path / "out.wav"), "pop", [])
    delivery = result["processing_applied"]["delivery"]
    assert delivery["candidate"] == "transparent_fallback" and delivery["transparent_fallback"]
    assert delivery["renders"] == C.MAX_CANDIDATE_RENDERS
    assert "guardrail:tilt_drift" in delivery["initial_failures"]
    assert result["source_warnings"][0].startswith("Minimal-processing master")


def test_peak_overshoot_is_trimmed_measured_and_re_rendered_not_failed(source, tmp_path, monkeypatch):
    """A render whose bus overshoots (simulated: +4 dB after the limiter on
    the first render only) is sample-peak trimmed, the TRIMMED audio is what
    the verdict measures, the true-peak failure is relieved by a corrective
    render, and the written file matches what the verdict measured."""
    from ai_mastering.audio_utils import _true_peak_db
    import pyloudnorm as pyln

    real = mastering.render_plan
    calls = {"n": 0}

    def overshoot_once(*a, **k):
        calls["n"] += 1
        out = real(*a, **k)
        if calls["n"] == 1:
            out["audio"] = (out["audio"] * 10 ** (4.0 / 20.0)).astype(np.float32)
        return out

    monkeypatch.setattr(mastering, "render_plan", overshoot_once)
    out = tmp_path / "out.wav"
    result = master_track(str(source), str(out), "pop", [])
    diag = result["mastering_diagnostics"]
    first = diag["candidates"][0]
    assert any(f.endswith("true_peak") or f.endswith("true_peak_over_ceiling") for f in first["failures"]), first
    assert diag["delivered_candidate"].startswith("corrective")
    written, sr = sf.read(str(out), dtype="float32", always_2d=True)
    ceiling = result["target_profile_used"]["true_peak_ceiling_dbtp"]
    assert _true_peak_db(written) <= ceiling + C.TRUE_PEAK_TOLERANCE_DB
    assert _true_peak_db(written) == pytest.approx(result["analysis_after"]["true_peak_db"], abs=0.1)
    assert float(pyln.Meter(sr).integrated_loudness(written)) == pytest.approx(result["analysis_after"]["integrated_lufs"], abs=0.1)
