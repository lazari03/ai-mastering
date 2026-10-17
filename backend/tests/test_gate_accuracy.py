"""Production-gate detectors for localized, dynamics and stereo damage
(docs/audits/DSP_GATE_ACCURACY.md; AURALITH-AUDIO-007/-008/-009/-001, QA-005).

Each defect is injected with the ground-truth generators of the defect
corpus (benchmark/defect_corpus.py) and judged by the SAME functions the
engine's verdict uses (benchmark.metric_validation.run_gate mirrors
mastering._build_candidate). Every "fires" test failed on the parent commit;
every "stays quiet" test pins the false-positive side.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pytest

from ai_mastering.analysis.profile import SourceProfile
from ai_mastering.audio_utils import _analysis_from_audio, _transient_metrics
from ai_mastering.evaluation.distortion import added_distortion_db
from ai_mastering.evaluation.evaluate import evaluate_master
from ai_mastering.evaluation.verdict import CORRECTABLE, _DOMAIN, build_verdict
from ai_mastering.output_validation import ValidationResult
from ai_mastering.planning import config as C
from ai_mastering.quality_control import added_width
from benchmark import defect_corpus as dc
from benchmark import metric_validation as mv


@lru_cache(maxsize=None)
def ref(name: str = "pop_mid") -> np.ndarray:
    return dc.make_reference(name)


def kinds(src: np.ndarray, proc: np.ndarray) -> set[str]:
    return set(mv.run_gate(src, proc)["verdict_kinds"]) - {"guardrail:loudness_target_missed"}


class _Ev:
    flags: list = []
    loudness = {"integrated_lufs": -14.0}


def _verdict(distortion: dict):
    return build_verdict(_Ev(), {"checks": []}, ValidationResult(passed=True), -14.0, -14.0, distortion=distortion)


# --------------------------------------------------------------- controls
@pytest.mark.parametrize("name", ["pop_mid", "hiphop_bassheavy"])
def test_harmless_changes_trip_none_of_the_new_checks(name):
    x = ref(name)
    for proc in (x.copy(), x * 10 ** (3 / 20), x * 10 ** (-3 / 20), dc.d_mono_fold(x)[0]):
        assert kinds(x, proc) == set()


# ------------------------------------------------- QA-005: DC and transients
def test_dc_offset_does_not_read_as_lost_punch():
    x = ref()
    clean = _transient_metrics(x, dc.SR)
    dcd = _transient_metrics((x + 0.02).astype(np.float32), dc.SR)
    # parent: punch 0.28 lower and short-term crest lower with only DC added
    assert dcd["drum_punch_estimate"] == pytest.approx(clean["drum_punch_estimate"], abs=0.01)
    assert dcd["short_term_crest_db"] == pytest.approx(clean["short_term_crest_db"], abs=0.1)
    assert not ({"evaluation:transient_loss", "guardrail:transient_loss"} & kinds(x, dc.d_dc(x, 0.02)[0]))


def test_dc_contaminated_master_fails_qc_for_the_right_reason():
    x = ref()
    r = mv.run_gate(x, dc.d_dc(x, 0.1)[0])  # -20 dBFS DC
    assert r["qc_status"]["dc_offset"] == "fail"
    assert "quality_control:dc_offset" in r["verdict_kinds"]
    assert not ({"evaluation:transient_loss", "guardrail:transient_loss"} & set(r["verdict_kinds"]))
    assert mv.run_gate(x, dc.d_dc(x, 0.005)[0])["qc_status"]["dc_offset"] == "warn"  # -46 dBFS: report only


def test_dc_switch_restores_parent_measurement(monkeypatch):
    x = (ref() + 0.02).astype(np.float32)
    monkeypatch.setattr(C, "TRANSIENT_DC_REMOVAL", False)
    off = _transient_metrics(x, dc.SR)["drum_punch_estimate"]
    monkeypatch.setattr(C, "TRANSIENT_DC_REMOVAL", True)
    on = _transient_metrics(x, dc.SR)["drum_punch_estimate"]
    assert on > off + 0.1


# ------------------------------------------- AUDIO-007: short distortion burst
def test_300ms_clip_burst_is_caught_per_window():
    x = ref()
    y, inj = dc.d_clip(x, 0.2, True)
    d = added_distortion_db(x, y, dc.SR)
    assert d["worst_db"] < C.MAX_ADDED_DISTORTION_DB  # the song-wide average still dilutes it...
    assert d["window_worst_db"] > C.MAX_WINDOW_DISTORTION_DB  # ...the worst window does not
    assert abs(d["window_worst_at_s"] - 6.0) < 0.5  # and it is located
    assert "distortion:distortion_burst" in kinds(x, y)
    v = _verdict({**d, "blamed_stage": "bus"})
    burst = [f for f in v.failures if f.kind == "distortion_burst"]
    assert burst and burst[0].domain == "distortion" and "distortion_burst" in CORRECTABLE


def test_linear_and_level_changes_have_no_windowed_distortion():
    x = ref()
    assert added_distortion_db(x, x * 0.5, dc.SR)["window_worst_db"] < -60.0
    assert added_distortion_db(x, dc.d_harsh_bell(x, 4)[0], dc.SR)["window_worst_db"] < -30.0


def test_windowed_distortion_switch(monkeypatch):
    d = {"worst_db": -40.0, "window_worst_db": -6.0, "window_worst_at_s": 1.0, "pumping_db": 0.0, "section_attack_loss_db": 0.0}
    assert any(f.kind == "distortion_burst" for f in _verdict(d).failures)
    monkeypatch.setattr(C, "WINDOWED_DISTORTION_CHECK", False)
    assert _verdict(d).passed


# ------------------------------------------------------- AUDIO-008: pumping
@pytest.mark.parametrize("db", [2.0, 4.0])
def test_kick_correlated_ducking_is_pumping(db):
    x = ref()
    y, inj = dc.d_pumping(x, db)
    d = added_distortion_db(x, y, dc.SR)
    # same unit as the injected (independently measured) HF dip on the kick grid
    assert d["pumping_db"] == pytest.approx(-inj["measured_hf_dip_db"], abs=0.6)
    assert "distortion:pumping" in kinds(x, y)
    assert _DOMAIN["pumping"] == "dynamics" and "pumping" in CORRECTABLE


def test_static_gain_and_eq_are_not_pumping():
    x = ref("hiphop_bassheavy")
    assert abs(added_distortion_db(x, x * 2.0, dc.SR)["pumping_db"]) < 0.1
    assert abs(added_distortion_db(x, dc.d_low_shelf(x, 4)[0], dc.SR)["pumping_db"]) < 0.3


# ------------------------------------ AUDIO-007: section-local transient loss
def test_section_transient_smear_is_caught_and_located():
    x = ref("jazz_sparse")
    y, _ = dc.d_transient(x, 6, True)  # 4-8 s only; parent gate passed it
    d = added_distortion_db(x, y, dc.SR)
    assert d["section_attack_loss_db"] > C.MAX_SECTION_ATTACK_LOSS_DB
    assert 2.0 <= d["section_attack_at_s"] <= 6.0
    assert "distortion:section_transient_loss" in kinds(x, y)


def test_uniform_attack_softening_is_not_a_section_problem():
    # A limiter softening every hit alike is the global check's business
    # (transient_loss); the section check measures the local EXCESS only.
    x = ref("jazz_sparse")
    y, _ = dc.d_transient(x, 3, False)
    d = added_distortion_db(x, y, dc.SR)
    assert d["attack_change_db"] < -1.0
    assert d["section_attack_loss_db"] < C.MAX_SECTION_ATTACK_LOSS_DB


# ------------------------------------- AUDIO-008: crest / range crush
def test_peak_crush_without_loudness_gain_fails_crest_collapse():
    x = ref()
    y, inj = dc.d_crest_crush(x, 4)
    r = mv.run_gate(x, y)
    assert r["fired"]["eval.crest_collapse"]  # parent: never fired at 2-8 dB crush


def test_range_crush_on_dynamic_material_fails_lra():
    x = ref("jazz_sparse")
    y, _ = dc.d_range_crush(x, 3.0)
    assert mv.run_gate(x, y)["fired"]["eval.lra_collapse"]  # parent: fired only from ratio 6 on one reference


# --------------------------------------------- AUDIO-009: width / mono
def test_side_boost_fails_mono_compatibility():
    x = ref()
    y, inj = dc.d_width(x, 6.0)
    r = mv.run_gate(x, y)
    assert r["qc_status"]["mono_compatibility"] == "fail"
    assert "quality_control:mono_compatibility" in r["verdict_kinds"]
    assert _DOMAIN["mono_compatibility"] == "stereo" and "mono_compatibility" in CORRECTABLE


def test_width_rule_is_source_relative():
    # a wide SOURCE kept as it was is not "added" width; narrowing never fails
    assert not added_width({"stereo_width_estimate": 1.2}, {"stereo_width_estimate": 1.2})["excess"]
    assert not added_width({"stereo_width_estimate": 0.4}, {"stereo_width_estimate": 0.2})["excess"]
    # near-mono source: a rise that stays inaudible (side 30 dB under mid) is ignored
    assert not added_width({"stereo_width_estimate": 0.01}, {"stereo_width_estimate": 0.03})["excess"]
    # the planner's maximum widening (1.5 dB + 0.7 dB user tweak) passes
    assert not added_width({"stereo_width_estimate": 0.3}, {"stereo_width_estimate": 0.3 * 10 ** (2.2 / 20)})["excess"]
    assert added_width({"stereo_width_estimate": 0.3}, {"stereo_width_estimate": 0.3 * 10 ** (6 / 20)})["excess"]


# --------------------------------------------- AUDIO-001: units are explicit
def test_transient_report_states_both_units():
    # delta / allowed_loss stay ABSOLUTE punch-score units (no threshold
    # moved); the report adds the fraction benchmark.metrics' lost_drums uses.
    x = ref()
    y, _ = dc.d_transient(x, 6, False)
    analysis_b, profile, context, plan, _ = mv._source_ctx(x)
    analysis_a = _analysis_from_audio(y, dc.SR)
    ev = evaluate_master(profile, SourceProfile.from_dict(analysis_a["source_profile"]), analysis_a, analysis_b, y, dc.SR, plan, context, {"stage_measurements": [], "limiter_report": {}})
    t = ev.transients
    assert t["loss_fraction"] == pytest.approx(-t["delta"] / t["source_transient_score"], abs=1e-3)
    assert t["delta"] == pytest.approx(t["master_transient_score"] - t["source_transient_score"], abs=1e-3)
