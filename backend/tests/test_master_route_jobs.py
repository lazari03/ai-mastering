"""/master through the job runner: real worker render, cancellation races,
deadlines and cleanup, at the HTTP layer."""

from __future__ import annotations

import dataclasses
import io
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import mastering as route
from app.services import mastering_service as ms
from synthetic import SR, make_mix


@pytest.fixture
def client(tmp_path, monkeypatch):
    s = dataclasses.replace(ms.settings, upload_dir=tmp_path / "up", output_dir=tmp_path / "out")
    s.upload_dir.mkdir()
    s.output_dir.mkdir()
    monkeypatch.setattr(ms, "settings", s)
    monkeypatch.setattr(route, "settings", s)
    app = FastAPI()
    app.include_router(route.router)
    return TestClient(app), s


def _wav(seconds=6.0):
    buf = io.BytesIO()
    sf.write(buf, make_mix(seconds=seconds, seed=2), SR, format="WAV")
    return buf.getvalue()


def _files(job_id, s):
    return [p.name for d in (s.upload_dir, s.output_dir) for p in d.glob(f"{job_id}_*")]


def test_real_render_runs_in_a_worker_and_reports_its_resources(client):
    c, s = client
    r = c.post("/master", files={"file": ("mix.wav", _wav(), "audio/wav")}, data={"genre": "pop", "job_id": "realjob01"})
    assert r.status_code == 200, r.text
    worker = r.json()["processing_applied"]["worker"]
    assert worker["peak_rss_mb"] > 0 and worker["estimated_mb"] >= worker["peak_rss_mb"], worker
    assert c.get("/jobs/realjob01").json()["state"] == "completed"
    assert any(n.startswith("realjob01_mastered") for n in _files("realjob01", s))


def test_cancel_landing_as_the_result_arrives_is_never_delivered(client, monkeypatch):
    c, s = client

    def finished_but_cancelled(rec, registry, *a, **k):
        (s.output_dir / f"{rec.job_id}_mastered.wav").write_bytes(b"late result")
        registry.request_cancel(rec.job_id)  # the gateway gave up a moment ago
        return {"job_id": rec.job_id}, {"peak_rss_mb": 1.0}

    monkeypatch.setattr(route, "run_in_worker", finished_but_cancelled)
    r = c.post("/master", files={"file": ("mix.wav", _wav(2.0), "audio/wav")}, data={"genre": "pop", "job_id": "racejob01"})
    assert r.status_code == 499 and r.headers["X-Error-Code"] == "cancelled"
    assert c.get("/jobs/racejob01").json()["state"] == "cancelled"
    assert _files("racejob01", s) == [], "no stale result may remain downloadable"


def test_a_deadline_already_passed_is_a_504_and_leaves_nothing_behind(client):
    c, s = client
    past = int((time.time() - 5) * 1000)
    r = c.post("/master", files={"file": ("mix.wav", _wav(2.0), "audio/wav")}, data={"genre": "pop", "job_id": "latejob01", "deadline_epoch_ms": str(past)})
    assert r.status_code == 504 and r.headers["X-Error-Code"] == "processing_timeout"
    assert _files("latejob01", s) == []


def test_worker_crash_is_a_500_with_a_code_and_cleans_up(client, monkeypatch):
    c, s = client
    from app.core.job_runner import JobTerminated

    def crashed(rec, *a, **k):
        raise JobTerminated("crashed", "worker stopped (exit code -9)")

    monkeypatch.setattr(route, "run_in_worker", crashed)
    r = c.post("/master", files={"file": ("mix.wav", _wav(2.0), "audio/wav")}, data={"genre": "pop", "job_id": "crashjob1"})
    assert r.status_code == 500 and r.headers["X-Error-Code"] == "worker_crashed"
    assert _files("crashjob1", s) == []


def test_duplicate_and_unknown_cancellations_are_harmless(client):
    c, _ = client
    assert c.post("/jobs/nosuchjob/cancel").json()["state"] == "unknown"
    route.registry.create("dupcancel1")
    first = c.post("/jobs/dupcancel1/cancel").json()
    second = c.post("/jobs/dupcancel1/cancel").json()
    assert first["cancel_requested"] and second["cancel_requested"]


def test_capacity_endpoint_reports_budget_and_source(client):
    c, _ = client
    snap = c.get("/capacity").json()
    assert snap["budget_mb"] > 0 and snap["budget_source"] and snap["reserved_mb"] == 0


def test_invalid_job_id_is_rejected(client):
    c, _ = client
    r = c.post("/master", files={"file": ("mix.wav", _wav(1.0), "audio/wav")}, data={"genre": "pop", "job_id": "../../etc"})
    assert r.status_code == 400


def test_a_stem_job_that_cannot_finish_in_time_is_refused_before_it_runs(client, monkeypatch):
    c, s = client
    # 10 s timeout at 3 s of work per audio second: the cap is ~3.3 s.
    s2 = dataclasses.replace(s, job_timeout_s=10.0, stem_seconds_per_audio_second=2.4, master_seconds_per_audio_second=0.6)
    monkeypatch.setattr(route, "settings", s2)
    ran = []
    monkeypatch.setattr(route, "run_in_worker", lambda *a, **k: ran.append(1))
    r = c.post("/master", files={"file": ("mix.wav", _wav(6.0), "audio/wav")}, data={"genre": "pop", "job_id": "stemlong01", "use_stem_separation": "true"})
    assert r.status_code == 413 and r.headers["X-Error-Code"] == "stems_too_long", r.text
    assert ran == [] and _files("stemlong01", s) == []
    # Without stems the same track is fine (cap only applies to separation).
    assert route.max_stem_duration_s(10.0) == pytest.approx(10.0 / 3.0)
