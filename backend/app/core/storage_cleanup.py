"""Deletes upload/output files older than settings.file_retention_hours.

Runs as a background asyncio task inside the FastAPI process (see
app/main.py) — no cron, no separate worker, one less moving part to deploy.
Intentionally simple: age-based file deletion, not job-aware. Not deleting
Firestore job/preset records, which are tiny and unrelated to this.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("mastering.storage_cleanup")

SWEEP_INTERVAL_SECONDS = 60 * 60  # hourly is plenty for a 48h-default TTL


def _sweep_dir(directory: Path, max_age_seconds: float) -> int:
    if not directory.exists():
        return 0
    now = time.time()
    removed = 0
    for path in directory.iterdir():
        try:
            if not path.is_file():
                continue
            if now - path.stat().st_mtime > max_age_seconds:
                path.unlink()
                removed += 1
        except FileNotFoundError:
            continue  # already removed by a concurrent sweep/request
        except OSError as error:
            logger.warning("Could not remove %s: %s", path, error)
    return removed


def sweep_once() -> int:
    """Runs one cleanup pass. Also called directly by tests/manual runs."""
    if settings.file_retention_hours <= 0:
        return 0
    max_age_seconds = settings.file_retention_hours * 3600
    removed = _sweep_dir(settings.upload_dir, max_age_seconds) + _sweep_dir(settings.output_dir, max_age_seconds)
    if removed:
        logger.info("Storage cleanup removed %d file(s) older than %dh", removed, settings.file_retention_hours)
    return removed


async def run_forever() -> None:
    if settings.file_retention_hours <= 0:
        logger.info("Storage cleanup disabled (MASTERING_FILE_RETENTION_HOURS=0)")
        return
    while True:
        try:
            sweep_once()
        except Exception:  # noqa: BLE001 — a bad sweep should never take the app down
            logger.exception("Storage cleanup sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
