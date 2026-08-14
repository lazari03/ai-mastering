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
    )


settings = load_settings()
