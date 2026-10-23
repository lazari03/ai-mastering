"""Input validation for job ids and file-route parameters.

One shared definition used by every route and service that turns a client
supplied id / extension / codec into a filesystem path.
"""

from __future__ import annotations

import re

from fastapi import HTTPException

JOB_ID_RE = re.compile(r"[A-Za-z0-9]{6,64}")
# Output formats the renderer can actually produce.
ALLOWED_OUTPUT_EXTS = frozenset({"wav", "mp3"})


def is_valid_job_id(job_id: object) -> bool:
    return isinstance(job_id, str) and JOB_ID_RE.fullmatch(job_id) is not None


def require_job_id(job_id: str) -> str:
    if not is_valid_job_id(job_id):
        raise HTTPException(400, "Invalid job id")
    return job_id


def require_output_ext(ext: str) -> str:
    if ext not in ALLOWED_OUTPUT_EXTS:
        raise HTTPException(400, "Invalid file format")
    return ext


def require_codec(codec: str, supported) -> str:
    if codec not in supported:
        raise HTTPException(400, f"Unknown codec. Options: {sorted(supported)}")
    return codec
