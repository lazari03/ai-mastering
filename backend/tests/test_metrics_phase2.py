"""Phase 2 benchmark-metric fixes (QA-002 midrange-relative bands, low-end bias, QA-005 DC).

Each test measures against an INDEPENDENT injected magnitude from
benchmark/defect_corpus.py and fails on the pre-fix benchmark/metrics.py.
"""

from __future__ import annotations

import pytest

from benchmark import defect_corpus as dc
from benchmark.metrics import compare


@pytest.fixture(scope="module")
def bass_heavy():
    return dc.make_reference("hiphop_bassheavy")


@pytest.fixture(scope="module")
def pop():
    return dc.make_reference("pop_mid")


@pytest.mark.parametrize("db", [2, 4, 6])
def test_loudness_matched_bass_cut_reads_injected_depth_and_no_phantom_highs(bass_heavy, db):
    y, inj = dc.d_low_shelf(bass_heavy, db)
    r = compare(bass_heavy, dc.match_loudness(y, bass_heavy), dc.SR)
    assert r["low_end_change_db"] == pytest.approx(inj["measured_db_40_100hz"], abs=0.3)  # was ~1.2-2.4 dB too shallow
    assert abs(r["high_change_db"]) < 0.3  # was +1.0..+2.45 dB (QA-002)
    assert "harsh_highs" not in [f["kind"] for f in r["failures"]]


def test_unmatched_bass_cut_gives_same_reading(bass_heavy):
    y, inj = dc.d_low_shelf(bass_heavy, 6)
    r = compare(bass_heavy, y, dc.SR)  # compare matches loudness itself
    assert r["low_end_change_db"] == pytest.approx(inj["measured_db_40_100hz"], abs=0.3)
    assert [f["kind"] for f in r["failures"] if f["kind"] == "weaker_bass"]


@pytest.mark.parametrize("db", [2, 4, 6])
def test_harsh_boost_reads_injected_boost(pop, db):
    y, inj = dc.d_harsh_bell(pop, db)
    r = compare(pop, y, dc.SR)
    assert r["high_change_db"] == pytest.approx(inj["measured_db_3_6khz"], abs=0.25)


def test_pure_gain_and_identity_stay_clean(bass_heavy):
    for db in (-3.0, 3.0):
        y, _ = dc.d_gain(bass_heavy, db)
        r = compare(bass_heavy, y, dc.SR)
        assert r["failures"] == [] and abs(r["low_end_change_db"]) < 0.05 and abs(r["high_change_db"]) < 0.05
    assert compare(bass_heavy, bass_heavy.copy(), dc.SR)["failures"] == []


@pytest.mark.parametrize("dcv", [0.005, 0.02, 0.1])
def test_dc_offset_does_not_read_as_lost_punch(pop, dcv):
    y, _ = dc.d_dc(pop, dcv)
    r = compare(pop, y, dc.SR)
    assert r["punch_loss"] == pytest.approx(0.0, abs=0.02)  # was 0.08 / 0.28 / 0.43 (QA-005)
    assert "lost_drums" not in [f["kind"] for f in r["failures"]]


def test_real_punch_loss_still_detected(pop):
    y, _ = dc.d_transient(pop, 9, False)
    assert compare(pop, y, dc.SR)["punch_loss"] > 0.05
