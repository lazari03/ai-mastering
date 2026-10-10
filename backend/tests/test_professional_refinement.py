"""Selection safeguards plus full mastering delivery/report consistency."""
from __future__ import annotations

import copy
from dataclasses import replace
from types import SimpleNamespace as NS

import numpy as np
import pytest
import soundfile as sf

import ai_mastering.mastering as mastering
from ai_mastering.evaluation.refinement import derive_refinement_plan, prefer_refinement
from ai_mastering.planning import config as C
from ai_mastering.processing.render import render_plan
from synthetic import SR, make_mix
from test_engines import _plans, COMPRESSING


def candidate(*, passed=True, loudness=0.0, transient=-0.03, crest=-1.0,
              gr=2.0, collateral=0.2, tonal=0.4, new_bands=()):
    return NS(
        verdict=NS(passed=passed, loudness={"shortfall_vs_requested_lu": loudness}),
        evaluation=NS(
            transients={"delta": transient},
            dynamics={"short_term_crest_change_db": crest},
            limiter={"gr_at_p995_peaks_db": gr},
            collateral_db={"bass": collateral},
            problem_outcomes={
                "mud": {"outside_window_after_db": tonal},
                "_new_problems_created": {"bands": list(new_bands)},
            },
        ),
    )


def test_verified_measured_benefit_is_selected():
    assert prefer_refinement(candidate(), candidate(transient=-0.01))[0]
    assert prefer_refinement(candidate(), candidate(crest=-0.8))[0]
    assert prefer_refinement(candidate(), candidate(gr=1.7))[0]


@pytest.mark.parametrize("changes", [
    {"passed": False}, {"loudness": 0.31}, {"transient": -0.04},
    {"crest": -1.2}, {"collateral": 0.31}, {"tonal": 0.51},
    {"new_bands": ("air",)}, {"gr": float("nan")},
])
def test_benefit_cannot_override_safety_or_preservation(changes):
    trial = candidate(**({"gr": 1.0} | changes))
    assert not prefer_refinement(candidate(), trial)[0]


def test_identical_trial_is_not_a_premium_improvement():
    assert not prefer_refinement(candidate(), candidate())[0]


def test_refinement_changes_real_render_without_mutating_original_plan():
    audio, plans = _plans(COMPRESSING, "edm")
    original = plans["professional"]
    original_dict = copy.deepcopy(original.to_dict())
    new, actions = derive_refinement_plan(original, candidate().evaluation)
    assert new is not None and actions
    assert original.to_dict() == original_dict
    assert new.eq_decisions == original.eq_decisions
    assert new.limiter["ceiling_dbtp"] == original.limiter["ceiling_dbtp"]
    assert new.loudness == original.loudness
    assert new.limiter["budget_db"] >= C.LIMITER_BUDGET_MIN_DB
    a = render_plan(audio, SR, original, measure_stages=False)["audio"]
    b = render_plan(audio, SR, new, measure_stages=False)["audio"]
    assert np.isfinite(b).all()
    assert not np.array_equal(a, b)


@pytest.mark.parametrize("tier,selected", [
    ("standard", False), ("professional", False), ("professional", True),
])
def test_full_delivery_uses_one_candidate_and_refinement_is_not_backoff(tmp_path, monkeypatch, tier, selected):
    source, output = tmp_path / "mix.wav", tmp_path / "master.wav"
    sf.write(source, make_mix(seconds=10.0, seed=3, healthy_variation_db=1.0), SR, subtype="FLOAT")
    built = []
    real_build = mastering._build_candidate

    def build(*args, **kwargs):
        value = real_build(*args, **kwargs)
        built.append(value)
        return value

    # Force a deterministic trial with the same safe plan. The selection
    # tests above cover actual quality comparisons; this checks orchestration.
    monkeypatch.setattr(mastering, "_build_candidate", build)
    monkeypatch.setattr(mastering, "derive_refinement_plan", lambda plan, ev: (plan.copy(), ["test trial"]))
    monkeypatch.setattr(mastering, "prefer_refinement", lambda old, trial: (selected and trial.verdict.passed, "test selection"))
    result = mastering.master_track(source, output, genre="pop", tags=[], tier=tier)
    diag = result["mastering_diagnostics"]
    info = diag["professional_refinement"]
    assert built[0].verdict.passed
    assert info["attempted"] is (tier == "professional")
    assert info["selected"] is (tier == "professional" and selected)
    assert diag["renders"] == len(built) <= C.MAX_CANDIDATE_RENDERS
    assert not diag["backoff_applied"]
    assert not diag["backoff"]["attempted"]
    delivered = built[-1] if info["selected"] else built[0]
    assert diag["delivered_candidate"] == delivered.label
    assert diag["evaluation"] == delivered.evaluation.to_dict()
    assert result["analysis_after"] == delivered.analysis_after
    assert result["processing_applied"]["delivery"]["professional_refinement"] == info
    actual, sr = sf.read(output, dtype="float32", always_2d=True)
    assert sr == SR
    np.testing.assert_allclose(actual, delivered.audio, atol=2e-7, rtol=0)


def test_failed_trial_keeps_verified_original(tmp_path, monkeypatch):
    source, output = tmp_path / "mix.wav", tmp_path / "master.wav"
    sf.write(source, make_mix(seconds=10.0, seed=3, healthy_variation_db=1.0), SR, subtype="FLOAT")
    real_build = mastering._build_candidate

    def build(label, *args, **kwargs):
        value = real_build(label, *args, **kwargs)
        if label == "professional_refinement":
            value = replace(value, verdict=replace(value.verdict, passed=False))
        return value

    monkeypatch.setattr(mastering, "_build_candidate", build)
    monkeypatch.setattr(mastering, "derive_refinement_plan", lambda plan, ev: (plan.copy(), ["test trial"]))
    result = mastering.master_track(source, output, genre="pop", tags=[], tier="professional")
    diag = result["mastering_diagnostics"]
    assert diag["delivered_candidate"] == "initial"
    assert diag["verdict"]["passed"]
    assert diag["professional_refinement"]["attempted"]
    assert not diag["professional_refinement"]["selected"]
