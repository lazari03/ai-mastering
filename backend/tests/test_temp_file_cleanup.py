"""AURALITH-PERF-002: decoded scratch WAVs and stale Demucs temp dirs are cleaned."""
import os
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.core import storage_cleanup
from app.services import mastering_service as ms


def _staged(tmp_path, reference=False):
    up, out = tmp_path / "up", tmp_path / "out"
    up.mkdir()
    out.mkdir()
    (up / "job123_input.mp3").write_bytes(b"orig")
    staged = {"job_id": "job123", "input_path": str(up / "job123_input.mp3"), "input_ext": ".mp3",
              "reference_path": None, "reference_ext": None, "upload_dir": str(up), "output_dir": str(out)}
    if reference:
        (up / "job123_reference.mp3").write_bytes(b"ref")
        staged["reference_path"], staged["reference_ext"] = str(up / "job123_reference.mp3"), ".mp3"
    return staged, up, out


def _fake_ffmpeg(monkeypatch):
    def run(cmd, **kw):
        Path(cmd[-1]).write_bytes(b"decoded")
        return MagicMock(returncode=0, stderr="")
    monkeypatch.setattr(ms.subprocess, "run", run)
    monkeypatch.setattr(ms, "_enforce_max_duration", lambda *a, **k: None)


CONFIG = {"output_format": "wav", "full_preset": None, "genre": "g", "tags": [], "tweaks": {}, "style": "s",
          "use_stem_separation": False}


def test_decoded_wav_removed_on_success(tmp_path, monkeypatch):
    staged, up, out = _staged(tmp_path, reference=True)
    _fake_ffmpeg(monkeypatch)
    seen = {}

    def adaptive(**kw):
        seen["decoded"] = Path(kw["input_path"]).exists() and Path(kw["reference_track_path"]).exists()
        Path(kw["output_path"]).write_bytes(b"m")
        return {"analysis_before": {"integrated_lufs": -20}, "analysis_after": {"integrated_lufs": -14},
                "processing_applied": {}, "target_profile_used": {}}
    monkeypatch.setattr(ms, "run_adaptive_mastering", adaptive)
    monkeypatch.setattr(ms, "deliver_and_verify", lambda *a, **k: {"gain_trim_db": 0, "integrated_lufs": None})
    monkeypatch.setattr(ms, "make_browser_preview", lambda *a, **k: None)
    ms.render_staged_job(staged, dict(CONFIG))
    assert seen["decoded"]
    assert not list(up.glob("*_internal.wav"))
    assert (up / "job123_input.mp3").exists() and (up / "job123_reference.mp3").exists()
    assert (out / "job123_mastered.wav").exists()


def test_decoded_wav_removed_on_failure(tmp_path, monkeypatch):
    staged, up, _ = _staged(tmp_path, reference=True)
    _fake_ffmpeg(monkeypatch)

    def boom(**kw):
        raise RuntimeError("worker blew up")
    monkeypatch.setattr(ms, "run_adaptive_mastering", boom)
    with pytest.raises(Exception):
        ms.render_staged_job(staged, dict(CONFIG))
    assert not list(up.glob("*_internal.wav"))
    assert (up / "job123_input.mp3").exists()


def test_partial_decode_removed_when_ffmpeg_fails(tmp_path, monkeypatch):
    staged, up, _ = _staged(tmp_path)

    def run(cmd, **kw):
        Path(cmd[-1]).write_bytes(b"partial")
        return MagicMock(returncode=1, stderr="bad")
    monkeypatch.setattr(ms.subprocess, "run", run)
    monkeypatch.setattr(ms, "_enforce_max_duration", lambda *a, **k: None)
    with pytest.raises(Exception):
        ms.render_staged_job(staged, dict(CONFIG))
    assert not list(up.glob("*_internal.wav"))


def test_stale_demucs_temp_dirs_swept(tmp_path):
    old = tmp_path / "ai_mastering_demucs_old"
    new = tmp_path / "ai_mastering_demucs_new"
    other = tmp_path / "unrelated_old"
    for d in (old, new, other):
        (d / "stems").mkdir(parents=True)
        (d / "stems" / "x.wav").write_bytes(b"x")
    past = time.time() - 5 * 3600
    for d in (old, other):
        os.utime(d, (past, past))
    assert storage_cleanup.sweep_stem_temp_dirs(root=tmp_path) == 1
    assert not old.exists() and new.exists() and other.exists()
