"""Worker targets for tests/test_job_runner.py. A real module (not test-local
functions) because workers import their target by name."""

from __future__ import annotations

import os
import subprocess
import sys
import time

from fastapi import HTTPException


def ok(value):
    return {"value": value}


def sleep(seconds):
    time.sleep(seconds)
    return {"slept": seconds}


def crash():
    os._exit(9)  # what the kernel OOM killer looks like from the parent


def bad_input():
    raise HTTPException(400, "Audio is digital silence")


def spawn_grandchild_and_hang(pidfile):
    # Stands in for Demucs: a grandchild process doing the heavy work.
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
    with open(pidfile, "w") as handle:
        handle.write(str(child.pid))
    time.sleep(120)
