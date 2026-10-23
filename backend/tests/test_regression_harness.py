"""The corpus regression harness runs end to end, records every metric the
engine decisions are judged on, and fails on drift beyond tolerance."""

from __future__ import annotations

import json

import soundfile as sf

from benchmark import regression
from synthetic import SR, make_mix


def _corpus(tmp_path):
    corpus = tmp_path / "corpus"
    for name, kw in {"bass_heavy": dict(offsets_db=[(40, 250, 6.5)]), "healthy": dict(healthy_variation_db=1.0)}.items():
        (corpus / name).mkdir(parents=True)
        sf.write(str(corpus / name / "mix.wav"), make_mix(seconds=10.0, seed=4, **kw), SR)
        (corpus / name / "meta.json").write_text(json.dumps({"genre": "pop"}))
    return corpus


def test_snapshot_records_the_metrics_and_detects_drift(tmp_path):
    corpus = _corpus(tmp_path)
    baseline = tmp_path / "baseline.json"
    assert regression.main(["--corpus", str(corpus), "--write", str(baseline), "--out", str(tmp_path / "r1")]) == 0
    snap = json.loads(baseline.read_text())
    track = snap["tracks"]["bass_heavy"]
    for key in ("source_lufs", "master_lufs", "true_peak_dbtp", "plr_db", "short_term_crest_change_db", "lra_change_lu",
                "transient_retention", "low_end_actual_db", "hf_actual_db", "tilt_drift_db_per_oct", "stereo_correlation",
                "limiter_gr_p995_db", "added_distortion_db", "delivered_candidate", "renders", "initial_failures", "genre"):
        assert key in track, key
    assert snap["calibration"]["thresholds"]["tilt_drift_db_per_oct"]["tracks"] == 2
    assert snap["calibration"]["by_genre"]["pop"]["tracks"] == 2
    assert snap["calibration"]["by_genre"]["pop"]["too_few_to_calibrate"]
    report = (tmp_path / "r1" / "report.md").read_text()
    assert "Threshold calibration" in report and "Per-genre headroom" in report

    # Same engine, same corpus: no drift.
    assert regression.compare(snap["tracks"], snap["tracks"]) == []
    # A moved metric and a changed winning candidate are both caught.
    moved = json.loads(baseline.read_text())
    moved["tracks"]["healthy"]["master_lufs"] += 1.0
    moved["tracks"]["healthy"]["delivered_candidate"] = "transparent_fallback"
    drift = regression.compare(snap["tracks"], moved["tracks"])
    assert {d["metric"] for d in drift} == {"master_lufs", "delivered_candidate"}
