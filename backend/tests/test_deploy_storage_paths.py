"""Uploads and masters must be written where the persistent volumes are
mounted. When they weren't, every deploy deleted every user's files while
their job records survived — downloads and previews 404'd ("File not found")."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def _compose_python():
    return yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["python-service"]


def _dockerfile_env() -> dict:
    text = (ROOT / "backend" / "Dockerfile").read_text().replace("\\\n", " ")
    env = {}
    for line in text.splitlines():
        if line.strip().startswith("ENV "):
            env.update(dict(re.findall(r"(\w+)=(\S+)", line)))
    return env


def test_storage_dirs_are_the_mounted_volumes():
    svc = _compose_python()
    mounts = {v.split(":")[1] for v in svc["volumes"] if not v.split(":")[0].startswith((".", "/"))}
    for key in ("MASTERING_UPLOAD_DIR", "MASTERING_OUTPUT_DIR"):
        assert svc["environment"][key] in mounts, (key, svc["environment"][key], mounts)
        assert _dockerfile_env()[key] == svc["environment"][key], key


def test_config_default_would_have_missed_the_volumes():
    """Documents WHY the explicit paths are required: in the image,
    config.py lives at /app/app/core/config.py and its default resolves
    one level above /app."""
    config_in_image = Path("/app/app/core/config.py")
    project_dir = config_in_image.parents[2].parent
    assert project_dir / "outputs" == Path("/outputs")
    assert Path("/outputs") not in {Path(m) for m in ("/app/outputs", "/app/uploads")}
