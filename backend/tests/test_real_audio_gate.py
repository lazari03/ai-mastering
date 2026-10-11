"""Real-audio regression gate end to end: the committed, licensed homepage-demo
mix is decoded, mastered by the real engine and compared with
benchmark/baselines/real.json. One ~33 s render (~20-40 s)."""

from __future__ import annotations

import json
from pathlib import Path

from benchmark import real_corpus, regression

BASELINE = Path(__file__).resolve().parents[1] / "benchmark/baselines/real.json"


def test_manifest_sources_are_licensed_and_present():
    assert real_corpus.MANIFEST
    for tid, entry in real_corpus.MANIFEST.items():
        assert entry["meta"].get("license"), tid
        assert (real_corpus.REPO / entry["path"]).exists(), entry["path"]


def test_user_tracks_without_license_are_skipped(tmp_path, monkeypatch):
    user = tmp_path / "user"
    (user / "nolicense").mkdir(parents=True)
    (user / "nolicense" / "mix.wav").write_bytes(b"x")
    (user / "nolicense" / "meta.json").write_text(json.dumps({"genre": "rock"}))
    monkeypatch.setattr(real_corpus, "USER_CORPUS", user)
    monkeypatch.setattr(real_corpus, "MANIFEST", {})
    _, info = real_corpus.build(tmp_path / "out")
    assert "nolicense" in info["skipped"] and not info["included"]


def test_real_gate_matches_committed_baseline(tmp_path, capsys):
    assert BASELINE.exists()
    rc = regression.main(["--real", "--only-manifest", "--baseline", str(BASELINE), "--out", str(tmp_path / "r")])
    out = capsys.readouterr().out
    assert rc == 0, out
    snap = json.loads((tmp_path / "r" / "snapshot.json").read_text())
    track = snap["tracks"]["pop_homepage_demo"]
    assert "error" not in track
    for key in ("mono_fold_loss_change_db", "sample_peak_dbfs", "clipped_samples"):
        assert key in track, key
