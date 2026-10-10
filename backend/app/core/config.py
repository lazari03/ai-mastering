from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_title: str
    app_version: str
    app_env: str
    api_prefix: str
    cors_origins: list[str]
    upload_dir: Path
    output_dir: Path
    max_upload_size_mb: int
    # Audio files (uploads, masters, codec previews) are deleted this many
    # hours after creation — this is a self-hosted VPS, not a storage
    # product; retaining every render forever grows disk usage without
    # bound and turns into a real bill. Users get a real download window
    # (see the frontend's "expires in" messaging), not permanent storage —
    # if that's ever needed, it's a paid tier backed by real object
    # storage, not free retention on this box. 0 disables cleanup (dev).
    file_retention_hours: int
    # /master is a synchronous `def` route, so FastAPI/Starlette runs each
    # call in the shared AnyIO worker-thread pool (default capacity 40
    # across the whole app) — with no cap of its own, that lets up to 40
    # full mastering renders (multi-stage DSP, optionally Demucs source
    # separation) run genuinely concurrently on one VPS. That's a real OOM
    # risk, not a theoretical one, on a single-box deploy with everything
    # else (Node API, frontend, Caddy) sharing the same RAM. See
    # mastering.py's master_track — this caps how many can actually run at
    # once; anything beyond it gets a 503 to retry, not queued silently.
    max_concurrent_masters: int
    # Longest input accepted, in minutes. The upload-size cap alone doesn't
    # bound work: 200 MB of MP3 is ~3 hours of audio, decoded in full and
    # run through several full-length candidate renders. Measured on the
    # dev container, an 8-minute track took 284 s and grew the process by
    # 2.3 GB (~35 s and ~285 MB per minute of audio), so 15 minutes is
    # ~9 minutes of render and ~4.5 GB per job, inside the gateway's
    # 19-minute deadline (backend-node pythonUpstream.js). Covers virtually
    # every song; DJ mixes and podcasts are out of scope. 0 disables.
    max_duration_minutes: float
    # --- Resource-aware job execution (app/core/job_runner.py) -----------
    # Memory budget for concurrently running mastering workers, MB. 0 =
    # derive it (container memory limit x 0.75, else host RAM x 0.5; see
    # resolve_memory_budget_mb). Set it explicitly in production to what
    # the python-service may really use.
    memory_budget_mb: float
    # Demucs is the heaviest job by far (docs/audits/RESOURCE_BENCHMARKS.md),
    # so stem jobs have their own cap on top of the memory budget.
    max_concurrent_stem_jobs: int
    # Bounded queue: at most this many jobs wait for capacity, each at most
    # queue_wait_s, before getting an explicit "server busy" answer.
    queue_max: int
    queue_wait_s: float
    # Hard limit for one render, enforced by killing the worker. Below the
    # gateway's 19-minute HTTP deadline (backend-node pythonUpstream.js) so
    # this service answers first, with a real reason.
    job_timeout_s: float
    # Peak-RSS cost model per worker (measured; see RESOURCE_BENCHMARKS.md).
    cost_worker_base_mb: float
    cost_per_audio_minute_mb: float
    cost_stem_extra_mb: float
    cost_reference_extra_mb: float
    # Wall-clock seconds per second of audio (measured on 4 vCPU; see
    # RESOURCE_BENCHMARKS.md). Used to refuse, up front, a stem job that
    # cannot finish inside job_timeout_s instead of letting it run for the
    # whole timeout and fail anyway.
    stem_seconds_per_audio_second: float
    master_seconds_per_audio_second: float


BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BASE_DIR.parent


def _parse_cors_origins(raw_value: str) -> list[str]:
    values = [item.strip() for item in raw_value.split(",") if item.strip()]
    return values or ["*"]


def load_settings() -> Settings:
    upload_dir = Path(os.getenv("MASTERING_UPLOAD_DIR", PROJECT_DIR / "uploads"))
    output_dir = Path(os.getenv("MASTERING_OUTPUT_DIR", PROJECT_DIR / "outputs"))

    upload_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    return Settings(
        app_title=os.getenv("MASTERING_APP_TITLE", "AI Mastering API"),
        app_version=os.getenv("MASTERING_APP_VERSION", "1.0.0"),
        app_env=os.getenv("MASTERING_ENV", "development"),
        api_prefix=os.getenv("MASTERING_API_PREFIX", ""),
        cors_origins=_parse_cors_origins(os.getenv("MASTERING_CORS_ORIGINS", "*")),
        upload_dir=upload_dir,
        output_dir=output_dir,
        max_upload_size_mb=int(os.getenv("MASTERING_MAX_UPLOAD_MB", "200")),
        file_retention_hours=int(os.getenv("MASTERING_FILE_RETENTION_HOURS", "48")),
        # Conservative default — tune to the VPS's real core count/RAM.
        # Better to make a burst of customers wait a few seconds and retry
        # than to let the box OOM and take mastering down for everyone.
        max_concurrent_masters=int(os.getenv("MASTERING_MAX_CONCURRENT_JOBS", "3")),
        max_duration_minutes=float(os.getenv("MASTERING_MAX_DURATION_MINUTES", "15")),
        memory_budget_mb=float(os.getenv("MASTERING_MEMORY_BUDGET_MB", "0")),
        max_concurrent_stem_jobs=int(os.getenv("MASTERING_MAX_CONCURRENT_STEM_JOBS", "1")),
        queue_max=int(os.getenv("MASTERING_QUEUE_MAX", "6")),
        queue_wait_s=float(os.getenv("MASTERING_QUEUE_WAIT_SECONDS", "120")),
        job_timeout_s=float(os.getenv("MASTERING_JOB_TIMEOUT_SECONDS", "1080")),
        cost_worker_base_mb=float(os.getenv("MASTERING_COST_BASE_MB", "450")),
        cost_per_audio_minute_mb=float(os.getenv("MASTERING_COST_PER_MINUTE_MB", "310")),
        cost_stem_extra_mb=float(os.getenv("MASTERING_COST_STEM_MB", "3700")),
        cost_reference_extra_mb=float(os.getenv("MASTERING_COST_REFERENCE_MB", "150")),
        stem_seconds_per_audio_second=float(os.getenv("MASTERING_STEM_SECONDS_PER_AUDIO_SECOND", "2.4")),
        master_seconds_per_audio_second=float(os.getenv("MASTERING_MASTER_SECONDS_PER_AUDIO_SECOND", "0.6")),
    )


settings = load_settings()
