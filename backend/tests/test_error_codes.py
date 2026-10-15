"""Client-facing error mapping: user-input failures are coded 4xx without internals."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import mastering_service as ms


def test_undecodable_compressed_upload_is_coded_400_without_stderr(tmp_path):
    bogus = tmp_path / "broken.mp3"
    bogus.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x00 definitely not mpeg frames " * 4)
    with pytest.raises(HTTPException) as info:
        ms._decode_input_if_required("a" * 32, bogus, ".mp3", work_dir=tmp_path)
    exc = info.value
    assert exc.status_code == 400
    assert exc.headers == {"X-Error-Code": "invalid_audio"}
    # ffmpeg stderr carries absolute paths and build banners; it must stay in the log.
    assert str(tmp_path) not in exc.detail
    assert "ffmpeg" not in exc.detail.lower()


def test_unsupported_output_format_carries_an_error_code():
    with pytest.raises(HTTPException) as info:
        ms.resolve_mastering_config(
            genre="pop", style=None, tags=[], tweaks={}, use_stem_separation=False, output_format="ogg", mix_preset=None
        )
    assert info.value.status_code == 400
    assert info.value.headers == {"X-Error-Code": "invalid_request"}


def test_api_docs_are_disabled_in_production(monkeypatch):
    import dataclasses
    import importlib
    import sys
    import types

    from fastapi import APIRouter

    from app.core import config

    # The chord route needs essentia/madmom (production-only deps); its
    # router is irrelevant to which docs routes the app registers.
    monkeypatch.setitem(sys.modules, "app.api.routes.chords", types.SimpleNamespace(router=APIRouter()))
    monkeypatch.setattr(config, "settings", dataclasses.replace(config.settings, app_env="production"))
    monkeypatch.delitem(sys.modules, "app.main", raising=False)
    main = importlib.import_module("app.main")
    paths = {getattr(route, "path", None) for route in main.app.routes}
    assert main.app.openapi_url is None and main.app.docs_url is None and main.app.redoc_url is None
    assert not paths & {"/docs", "/redoc", "/openapi.json"}
    monkeypatch.delitem(sys.modules, "app.main", raising=False)
