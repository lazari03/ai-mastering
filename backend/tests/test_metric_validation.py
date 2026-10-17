"""The defect corpus is deterministic and injects what it claims; the scorecard runs.

Deliberately NOT asserted: how accurate the detectors are. That is the
baseline benchmark.metric_validation measures and records
(docs/audits/METRIC_VALIDATION.md).
"""

from __future__ import annotations

import numpy as np
import pytest

from benchmark import defect_corpus as dc
from benchmark import metric_validation as mv


@pytest.fixture(scope="module")
def ref():
    return dc.make_reference("pop_mid")


def test_reference_and_defects_are_deterministic(ref):
    again = dc.make_reference("pop_mid")
    assert dc.audio_hash(ref) == dc.audio_hash(again)
    y1, _ = dc.d_harsh_bell(ref, 4)
    y2, _ = dc.d_harsh_bell(again, 4)
    assert dc.audio_hash(y1) == dc.audio_hash(y2)
    t1, _ = dc.d_transient(ref, 6, False)
    t2, _ = dc.d_transient(again, 6, False)
    assert dc.audio_hash(t1) == dc.audio_hash(t2)


def test_reference_has_headroom_and_is_stereo(ref):
    assert ref.ndim == 2 and ref.shape[1] == 2
    assert float(np.max(np.abs(ref))) <= dc.REF_PEAK + 1e-6


@pytest.mark.parametrize("db", [2, 4, 6])
def test_low_shelf_injects_claimed_cut(ref, db):
    y, inj = dc.d_low_shelf(ref, db)
    # independent FFT band energy, not the engine's analysis
    got = dc._band_rms_db(y, 40, 100) - dc._band_rms_db(ref, 40, 100)
    assert got == pytest.approx(-db, abs=0.3)
    assert abs(dc._band_rms_db(y, 500, 2000) - dc._band_rms_db(ref, 500, 2000)) < 0.1  # nothing else moved


@pytest.mark.parametrize("db", [2, 4, 6])
def test_harsh_bell_injects_claimed_boost(ref, db):
    y, _ = dc.d_harsh_bell(ref, db)
    assert dc._band_rms_db(y, 3300, 5500) - dc._band_rms_db(ref, 3300, 5500) == pytest.approx(db, abs=0.3)
    assert abs(dc._band_rms_db(y, 200, 1000) - dc._band_rms_db(ref, 200, 1000)) < 0.1


def test_loudness_matched_variant_is_matched(ref):
    y, _ = dc.d_harsh_bell(ref, 6)
    m = dc.match_loudness(y, ref)
    assert abs(dc._lufs(m) - dc._lufs(ref)) < 0.05
    assert abs(dc._lufs(y) - dc._lufs(ref)) > 0.3  # the raw variant IS louder


@pytest.mark.parametrize("db", [-3.0, 3.0])
def test_pure_gain_changes_only_level(ref, db):
    y, inj = dc.d_gain(ref, db)
    assert inj["lufs_change_db"] == pytest.approx(db, abs=0.05)
    assert np.allclose(y, ref * 10 ** (db / 20), atol=1e-6)


def test_transient_shaper_is_monotonic_and_sectional(ref):
    depths = [dc.d_transient(ref, d, False)[1]["measured_attack_depth_db"] for d in (3, 6, 9)]
    assert depths[0] > depths[1] > depths[2]  # more dose, deeper (more negative) attack cut
    assert depths[2] < -1.0
    y, _ = dc.d_transient(ref, 9, True)
    out = slice(0, int(3.5 * dc.SR))
    assert np.array_equal(y[out], ref[out])  # untouched outside the section
    assert not np.array_equal(y[int(4.2 * dc.SR) : int(7.5 * dc.SR)], ref[int(4.2 * dc.SR) : int(7.5 * dc.SR)])


@pytest.mark.parametrize("rate", [0.005, 0.02, 0.08])
def test_clip_rate_matches(ref, rate):
    y, inj = dc.d_clip(ref, rate, False)
    thr = np.max(np.abs(y))
    assert np.mean(np.abs(ref) > thr * 0.99999) == pytest.approx(rate, abs=0.003)
    assert inj["clip_rate_in_region"] == pytest.approx(rate, abs=0.003)


def test_burst_is_short_and_local(ref):
    y, inj = dc.d_clip(ref, 0.2, True)
    changed = np.flatnonzero(np.any(y != ref, axis=1))
    assert (changed[-1] - changed[0]) / dc.SR <= dc.BURST_S + 1e-3
    assert dc.BURST_S < 0.5


@pytest.mark.parametrize("db", [1, 2, 4])
def test_pumping_dip_matches_kick_grid(ref, db):
    _, inj = dc.d_pumping(ref, db)
    # HF dip on kick frames vs calm frames, measured on the known kick grid
    assert inj["measured_hf_dip_db"] == pytest.approx(-db, abs=0.5 * db + 0.3)
    assert inj["measured_hf_dip_db"] < 0


def test_stereo_defects(ref):
    pol, inj = dc.d_polarity(ref)
    assert np.array_equal(pol[:, 0], ref[:, 0]) and np.array_equal(pol[:, 1], -ref[:, 1])
    assert inj["correlation"] < -0.5
    c_half = dc.d_phase_cancel(ref, 0.5)[1]["correlation"]
    c_quarter = dc.d_phase_cancel(ref, 0.25)[1]["correlation"]
    assert c_half < c_quarter < float(np.corrcoef(ref[:, 0], ref[:, 1])[0, 1])
    s6 = dc.d_width(ref, 6)[1]["side_over_mid_db"]
    s12 = dc.d_width(ref, 12)[1]["side_over_mid_db"]
    assert s12 - s6 == pytest.approx(6.0, abs=0.1)
    mono, _ = dc.d_mono_fold(ref)
    assert np.array_equal(mono[:, 0], mono[:, 1])


def test_crest_crush_reaches_target_and_range_crush_reduces_range(ref):
    _, inj = dc.d_crest_crush(ref, 4)
    assert inj["crest_drop_db"] == pytest.approx(4.0, abs=0.7)
    _, inj2 = dc.d_range_crush(ref, 6.0)
    assert inj2["level_range_drop_db"] > 0.2


def test_dc_and_true_peak_injection(ref):
    y, inj = dc.d_dc(ref, 0.05)
    assert float(np.mean(y)) == pytest.approx(float(np.mean(ref)) + 0.05, abs=1e-4)
    for tp in (0.5, 2.0):
        y, inj = dc.d_isp(ref, tp)
        assert inj["true_peak_db_indep"] == pytest.approx(tp, abs=0.4)
        assert np.max(np.abs(y)) < 0.9999  # inter-sample only: no full-scale sample
    y, inj = dc.d_tp_over(ref, 3.0)
    assert inj["sample_peak_db"] == pytest.approx(3.0, abs=0.05)
    fs, inj = dc.d_clip_fullscale(ref, 10.0)
    assert np.max(np.abs(fs)) <= 1.0 and inj["clip_rate"] > 0


def test_build_cases_quick_is_labelled_and_deterministic():
    a = dc.build_cases(quick=True)
    b = dc.build_cases(quick=True)
    assert [c.case_id for c in a] == [c.case_id for c in b]
    assert [dc.audio_hash(c.processed) for c in a] == [dc.audio_hash(c.processed) for c in b]
    labels = {c.label for c in a}
    assert labels == {"defect", "control"}
    assert {"identity", "pure_gain", "mono_fold"} <= {c.defect_class for c in a if c.label == "control"}
    assert all(c.injected is not None for c in a)
    # every defect class named in the scorecard mapping exists in the corpus
    assert set(mv.RELEVANT) <= {c.defect_class for c in a}


def test_scorecard_smoke_on_tiny_subset():
    cases = [c for c in dc.build_cases(references=["pop_mid"], quick=True) if c.defect_class in ("identity", "pure_gain", "low_end_loss", "harsh_highs", "dc_offset")]
    records = [mv._work(c) for c in cases]
    assert all(r["error"] is None for r in records), [r["error"] for r in records if r["error"]]
    card = mv.score(records)
    assert "verdict.blocked_ex_level" in card["detectors"]
    assert {"low_end_loss", "harsh_highs", "dc_offset"} <= set(card["coverage"])
    md = mv.render_md(card, records, {"quick": True, "n_cases": len(records), "seconds": 0.0, "code_hash": "test"})
    assert "Coverage" in md and "False positives" in md
    # record, don't assert, accuracy: but identity must produce no estimated level change
    ident = next(r for r in records if r["defect_class"] == "identity")
    assert abs(ident["result"]["est"]["loudness_change_lu"]) < 0.01
