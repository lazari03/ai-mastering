"""Pure-logic tests for the API QA lab rules (no server, no audio engine)."""

import dataclasses

from benchmark import api_qa
from benchmark.qa_corpus import CASES, FEATURE_CASES, Case, input_hash, render

BY_ID = {c.id: c for c in CASES + FEATURE_CASES}
REFUSE = BY_ID["c20a_garbage"]


def test_refusal_requires_400_and_declared_code():
    assert api_qa.judge_refusal(REFUSE, 400, "invalid_audio", "bad")[0] == "PASS"
    for status, code in [(409, "duplicate_job"), (413, "too_long"), (499, "cancelled"), (503, "overloaded"), (400, "other"), (400, "")]:
        assert api_qa.judge_refusal(REFUSE, status, code, "x")[0] == "FAIL"
    assert api_qa.judge_refusal(REFUSE, 400, "invalid_audio", None)[0] == "FAIL"


def test_case_can_declare_other_codes_including_absent_header():
    f04 = BY_ID["f04_output_flac_refused"]
    assert api_qa.judge_refusal(f04, 400, "", "bad format")[0] == "PASS"
    assert api_qa.judge_refusal(f04, 400, "invalid_audio", "bad format")[0] == "FAIL"


def test_master_expectation_never_passes_on_error():
    assert api_qa.judge_refusal(BY_ID["c01_balanced_pop"], 400, "invalid_audio", "x")[0] == "FAIL"


def test_input_hash_includes_expect_codes_and_reference_audio():
    c = BY_ID["f04_output_flac_refused"]
    data = render(c)
    base = input_hash(c, data)
    assert input_hash(dataclasses.replace(c, expect="master"), data) != base
    assert input_hash(dataclasses.replace(c, refuse_codes=("x",)), data) != base
    f05 = BY_ID["f05_reference_mastering"]
    d, ref_a, ref_b = render(f05), render(BY_ID["c01_balanced_pop"]), render(BY_ID["c02_bass_heavy_hiphop"])
    assert input_hash(f05, d, ref_a) != input_hash(f05, d, ref_b)
    assert input_hash(f05, d, ref_a) == input_hash(f05, d, ref_a)


def test_missing_loudness_target_fails_for_master_only():
    assert api_qa.loudness_check("master", None, -13.0) is False
    assert api_qa.loudness_check("master", -13.0, None) is False
    assert api_qa.loudness_check("master_or_refuse", None, -13.0) is None
    assert api_qa.loudness_check("master", -13.0, -13.5) is True
    assert api_qa.loudness_check("master", -13.0, -20.0) is False


def test_stale_cases_kept_and_counted_non_pass():
    prev = {"code_hash": "old", "cases": {
        "c09_phase_inverted": {"status": "FAIL"}, "c01_balanced_pop": {"status": "PASS"}, "removed_case": {"status": "PASS"},
        "c02_bass_heavy_hiphop": {"status": "PASS", "code_hash": "new"}}}
    out = api_qa.carry_forward(prev, "new", set(BY_ID))
    assert "removed_case" not in out
    assert out["c09_phase_inverted"]["status"] == "STALE" and out["c09_phase_inverted"]["status_before_stale"] == "FAIL"
    assert out["c01_balanced_pop"]["status"] == "STALE"
    assert out["c02_bass_heavy_hiphop"]["status"] == "PASS"
    counts = api_qa.status_counts(out)
    assert counts == {"STALE": 2, "PASS": 1} and "PASS" in counts and counts["STALE"] == 2
    again = api_qa.carry_forward({"code_hash": "new", "cases": out}, "new", set(BY_ID))
    assert again["c09_phase_inverted"]["status"] == "STALE"  # stays STALE until actually re-run


def test_stale_or_other_hash_never_reused_as_cache():
    rec = {"input_hash": "h", "status": "PASS", "code_hash": "A"}
    assert api_qa.reusable(rec, "h", "A")
    assert not api_qa.reusable(rec, "h", "B")
    assert not api_qa.reusable({**rec, "status": "STALE"}, "h", "A")
    assert not api_qa.reusable(rec, "other", "A")


def test_engine_summary_reads_real_response_keys():
    body = {"before_lufs": -18, "after_lufs": -13, "processing_applied": {
        "worker": {"wall_s": 1}, "mastering_diagnostics": {
            "engine": "adaptive_plan_v2", "delivered_candidate": "corrective_1", "backoff_applied": True, "backoff": {"actions": ["less limiter"]}, "renders": 2,
            "verdict": {"passed": True, "failures": [], "warnings": [{"source": "qc", "kind": "w"}]},
            "initial_verdict": {"passed": False, "failures": [{"source": "guardrail", "kind": "excessive_band_change"}]},
            "candidates": [{"label": "initial", "passed": False, "failures": ["guardrail:excessive_band_change"], "actions": []}]}}}
    e = api_qa.engine_summary(body)
    assert e["verdict_passed"] is True and e["delivered_candidate"] == "corrective_1" and e["backoff_actions"] == ["less limiter"]
    assert e["initial_verdict_failures"] == ["guardrail:excessive_band_change"] and e["candidates"][0]["label"] == "initial"
