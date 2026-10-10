"""Input validation for job ids and file-route parameters."""

from __future__ import annotations

import dataclasses

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import mastering as route
from app.core.ids import is_valid_job_id
from app.services import mastering_service as ms

BAD_JOB_IDS = ["*", "0*", "[a-f]*", "????????", "..", "abc def", "short", "x" * 65, "abc_def_ghi", "other*"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    s = dataclasses.replace(ms.settings, upload_dir=tmp_path / "up", output_dir=tmp_path / "out")
    s.upload_dir.mkdir()
    s.output_dir.mkdir()
    monkeypatch.setattr(ms, "settings", s)
    monkeypatch.setattr(route, "settings", s)
    app = FastAPI()
    app.include_router(route.router)
    (s.upload_dir / "otheruser01_input.wav").write_bytes(b"u")
    (s.output_dir / "otheruser01_mastered.wav").write_bytes(b"m")
    (s.output_dir / "otheruser01_preview.wav").write_bytes(b"p")
    (s.output_dir / "otheruser01_codec_mp3_128.wav").write_bytes(b"c")
    return TestClient(app), s


def _count(s):
    return sum(1 for d in (s.upload_dir, s.output_dir) for p in d.glob("otheruser01_*"))


def test_job_id_validator_accepts_only_plain_alphanumerics():
    for ok in ("realjob01", "a" * 32, "A1b2C3"):
        assert is_valid_job_id(ok)
    for bad in BAD_JOB_IDS + ["", None, 5, "ab-cdef", "abc\n123456"]:
        assert not is_valid_job_id(bad)


@pytest.mark.parametrize("bad", BAD_JOB_IDS)
def test_rejects_malformed_job_ids_on_every_route(client, bad):
    c, s = client
    for method, url in [
        ("get", f"/original/{bad}"),
        ("get", f"/preview/{bad}"),
        ("get", f"/download/{bad}.wav"),
        ("get", f"/download-codec-preview/{bad}/mp3_128"),
        ("get", f"/jobs/{bad}"),
        ("post", f"/jobs/{bad}/cancel"),
        ("delete", f"/files/{bad}"),
    ]:
        r = getattr(c, method)(url)
        assert r.status_code in (400, 404), (method, url, r.status_code)
    assert c.post("/codec-preview", data={"job_id": bad, "codec": "mp3_128"}).status_code == 400
    assert _count(s) == 4


def test_wildcard_delete_leaves_other_jobs_files(client):
    c, s = client
    assert c.delete("/files/*").status_code == 400
    assert c.delete("/files/otheruser0*").status_code == 400
    assert _count(s) == 4
    assert c.delete("/files/otheruser01").json() == {"removed": 4}


def test_rejects_unknown_extension_and_codec(client):
    c, _ = client
    assert c.get("/download/otheruser01.exe").status_code == 400
    assert c.get("/download-codec-preview/otheruser01/not_a_codec").status_code == 400
    assert c.get("/download-codec-preview/otheruser01/..%2F..%2Foriginal%2Fx").status_code in (400, 404)
    assert c.post("/codec-preview", data={"job_id": "otheruser01", "codec": "bogus"}).status_code == 400


def test_valid_requests_keep_working(client):
    c, _ = client
    assert c.get("/download/otheruser01.wav").status_code == 200
    assert c.get("/original/otheruser01").status_code == 200
    assert c.get("/preview/otheruser01").status_code == 200
    assert c.get("/download-codec-preview/otheruser01/mp3_128").status_code == 200
