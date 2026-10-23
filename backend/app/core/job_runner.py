"""Bounded, killable execution for mastering jobs.

Why this exists
---------------
/master used to render on a server thread behind a count-only semaphore
(3 jobs). Two problems:

* Admission ignored size. Measured: ~35 s and ~285 MB of RSS per minute of
  audio on top of a fixed worker base, so three 15-minute jobs (~4.5 GB
  each) were admitted exactly like three 10-second ones.
* Nothing could stop a render. CPU-bound Python on a thread can't be
  cancelled, so when the caller gave up (timeout, cancellation) the render
  ran on, holding memory and a slot, and its result went nowhere. Demucs
  runs as a grandchild process and had its own 30-minute timeouts.

What it does
------------
* ResourceGovernor admits a job only when its ESTIMATED peak memory fits
  the remaining budget, the job-count cap allows it, and (for stem jobs)
  the separate Demucs cap allows it. Waiting is a bounded FIFO queue with a
  bounded wait; beyond either bound the caller gets an explicit overload
  error instead of an unbounded pile-up. A job that could never fit is
  refused immediately. Release is guaranteed (context manager).
* Each admitted job renders in its own worker PROCESS (forkserver, so
  heavy imports are paid once, not per job), in its own process group. A
  deadline, a cancellation or the worker dying ends it with SIGKILL to the
  whole group, which also stops a running Demucs subprocess.
* JobRegistry records each job's state, so cancel is idempotent and a late
  result of a cancelled/timed-out job is discarded (and its files removed)
  instead of delivered.
"""

from __future__ import annotations

import logging
import multiprocessing
import os
import signal
import threading
import time
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Memory budget
# ---------------------------------------------------------------------------


def _cgroup_limit_bytes() -> int | None:
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            raw = Path(path).read_text().strip()
        except OSError:
            continue
        if raw and raw != "max":
            value = int(raw)
            # Unlimited cgroups report a huge sentinel (2^63 rounded to page).
            if 0 < value < (1 << 60):
                return value
    return None


def _host_total_bytes() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) * 1024
    except OSError:
        pass
    return None


def resolve_memory_budget_mb(explicit_mb: float | None, cgroup_fraction: float = 0.75, host_fraction: float = 0.5) -> tuple[float, str]:
    """(budget MB, where it came from). Explicit setting wins. Otherwise the
    container's memory limit (minus headroom for the service itself), else
    half of host RAM: on a VPS that also runs the Node API, the frontend
    and Caddy, assuming the whole machine is ours would be wrong. Last
    resort a conservative fixed figure."""
    if explicit_mb and explicit_mb > 0:
        return float(explicit_mb), "MASTERING_MEMORY_BUDGET_MB"
    limit = _cgroup_limit_bytes()
    if limit:
        return limit / 2**20 * cgroup_fraction, f"cgroup limit {limit / 2**30:.1f} GiB x {cgroup_fraction}"
    total = _host_total_bytes()
    if total:
        return total / 2**20 * host_fraction, f"host RAM {total / 2**30:.1f} GiB x {host_fraction} (no container limit set)"
    return 4096.0, "fallback (no limit discoverable)"


@dataclass(frozen=True)
class CostModel:
    """Estimated peak RSS of one worker. Coefficients come from measurement
    (docs/audits/RESOURCE_BENCHMARKS.md) and are configurable because they
    depend on the machine and library versions."""

    worker_base_mb: float
    per_audio_minute_mb: float
    stem_extra_mb: float
    reference_extra_mb: float

    def estimate_mb(self, duration_s: float | None, stems: bool, reference: bool = False, sample_rate: int | None = None) -> float:
        minutes = max(float(duration_s or 0.0), 1.0) / 60.0
        # Memory scales with samples, not seconds: a 96 kHz upload is ~2.2x
        # a 44.1 kHz one of the same length.
        rate_scale = max(1.0, float(sample_rate or 44100) / 44100.0)
        mb = self.worker_base_mb + self.per_audio_minute_mb * minutes * rate_scale
        if stems:
            mb += self.stem_extra_mb
        if reference:
            mb += self.reference_extra_mb
        return mb


# ---------------------------------------------------------------------------
# Admission
# ---------------------------------------------------------------------------


class CapacityError(Exception):
    """Raised instead of admitting a job. `code` is a stable machine string
    the gateway maps to a localized message; `retry_after_s` is advice."""

    def __init__(self, status: int, code: str, detail: str, retry_after_s: int | None = None):
        super().__init__(detail)
        self.status, self.code, self.detail, self.retry_after_s = status, code, detail, retry_after_s


@dataclass
class _Ticket:
    job_id: str
    est_mb: float
    stems: bool
    cancelled: bool = False


class ResourceGovernor:
    def __init__(self, budget_mb: float, max_jobs: int, max_stem_jobs: int, queue_max: int, queue_wait_s: float):
        self.budget_mb = float(budget_mb)
        self.max_jobs = max(1, int(max_jobs))
        self.max_stem_jobs = max(0, int(max_stem_jobs))
        self.queue_max = max(0, int(queue_max))
        self.queue_wait_s = float(queue_wait_s)
        self._cond = threading.Condition()
        self._queue: deque[_Ticket] = deque()
        self._running: dict[str, _Ticket] = {}

    # -- introspection ----------------------------------------------------
    def snapshot(self) -> dict:
        with self._cond:
            return {
                "budget_mb": round(self.budget_mb),
                "reserved_mb": round(self._reserved_mb()),
                "running": len(self._running),
                "running_stem_jobs": sum(t.stems for t in self._running.values()),
                "queued": len(self._queue),
                "max_jobs": self.max_jobs,
                "max_stem_jobs": self.max_stem_jobs,
                "queue_max": self.queue_max,
            }

    def _reserved_mb(self) -> float:
        return sum(t.est_mb for t in self._running.values())

    def _fits(self, t: _Ticket) -> bool:
        if len(self._running) >= self.max_jobs:
            return False
        if t.stems and sum(x.stems for x in self._running.values()) >= self.max_stem_jobs:
            return False
        return self._reserved_mb() + t.est_mb <= self.budget_mb

    # -- admission --------------------------------------------------------
    @contextmanager
    def admit(self, job_id: str, est_mb: float, stems: bool, wait_s: float | None = None):
        if stems and self.max_stem_jobs == 0:
            raise CapacityError(503, "stems_unavailable", "Stem separation is disabled on this server.")
        if est_mb > self.budget_mb:
            raise CapacityError(
                413, "too_large_for_server",
                f"This job needs about {est_mb / 1024:.1f} GB of memory; this server's budget is {self.budget_mb / 1024:.1f} GB. Try a shorter file"
                + (" or master it without stem separation." if stems else "."),
            )
        ticket = _Ticket(job_id, float(est_mb), bool(stems))
        deadline = time.monotonic() + (self.queue_wait_s if wait_s is None else float(wait_s))
        with self._cond:
            if not (not self._queue and self._fits(ticket)):
                if len(self._queue) >= self.queue_max:
                    raise CapacityError(503, "at_capacity", "The server is busy with other masters. Please try again in a minute.", retry_after_s=60)
                self._queue.append(ticket)
                try:
                    # FIFO: only the head may start, so a large job isn't
                    # starved forever by a stream of small ones.
                    while not (self._queue[0] is ticket and self._fits(ticket)):
                        if ticket.cancelled:
                            raise CapacityError(499, "cancelled", "The job was cancelled while waiting for capacity.")
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise CapacityError(503, "queue_timeout", "The server stayed busy for too long. Please try again in a minute.", retry_after_s=60)
                        self._cond.wait(min(remaining, 1.0))
                finally:
                    if ticket in self._queue:
                        self._queue.remove(ticket)
                        self._cond.notify_all()
            self._running[job_id] = ticket
        try:
            yield ticket
        finally:
            with self._cond:
                self._running.pop(job_id, None)
                self._cond.notify_all()

    def cancel_queued(self, job_id: str) -> bool:
        with self._cond:
            for t in self._queue:
                if t.job_id == job_id:
                    t.cancelled = True
                    self._cond.notify_all()
                    return True
        return False


# ---------------------------------------------------------------------------
# Job registry
# ---------------------------------------------------------------------------

TERMINAL = {"completed", "failed", "cancelled", "timed_out"}


@dataclass
class JobRecord:
    job_id: str
    state: str = "queued"  # queued -> running -> completed | failed | cancelled | timed_out
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)
    pid: int | None = None
    cancel_requested: bool = False
    detail: str | None = None
    peak_rss_mb: float | None = None


class JobRegistry:
    """In-memory, per process. Enough for cancel/late-result decisions while
    the service is up; after a restart every in-flight job is gone with its
    worker (workers die with the process group of the service), and the
    gateway reconciles billing from its own durable reservation records."""

    def __init__(self, keep_s: float = 3600.0):
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self._keep_s = keep_s

    def create(self, job_id: str) -> JobRecord:
        with self._lock:
            self._prune()
            if job_id in self._jobs and self._jobs[job_id].state not in TERMINAL:
                raise CapacityError(409, "duplicate_job", f"Job {job_id} is already running.")
            rec = JobRecord(job_id)
            self._jobs[job_id] = rec
            return rec

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def transition(self, job_id: str, state: str, **fields) -> JobRecord | None:
        """Moves a non-terminal job to `state`. A terminal job never changes
        again: this is what makes completion vs cancellation race-safe (the
        first terminal transition wins)."""
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None or rec.state in TERMINAL:
                return rec
            rec.state = state
            rec.updated = time.time()
            for k, v in fields.items():
                setattr(rec, k, v)
            return rec

    def request_cancel(self, job_id: str) -> JobRecord | None:
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is not None and rec.state not in TERMINAL:
                rec.cancel_requested = True
            return rec

    def _prune(self) -> None:
        cutoff = time.time() - self._keep_s
        for jid in [j for j, r in self._jobs.items() if r.state in TERMINAL and r.updated < cutoff]:
            del self._jobs[jid]


# ---------------------------------------------------------------------------
# Worker process
# ---------------------------------------------------------------------------

_ctx = None
_ctx_lock = threading.Lock()


def _mp_context(preload: list[str] | None = None):
    """forkserver on Linux: workers fork from a clean, single-threaded server
    process that has the heavy modules imported once (fork from the
    threaded server itself is unsafe), so a job starts in milliseconds
    rather than re-importing numpy/scipy/librosa for seconds."""
    global _ctx
    with _ctx_lock:
        if _ctx is None:
            method = "forkserver" if "forkserver" in multiprocessing.get_all_start_methods() else "spawn"
            _ctx = multiprocessing.get_context(method)
            if method == "forkserver" and preload:
                _ctx.set_forkserver_preload(preload)
        return _ctx


def _worker_entry(conn, target_module: str, target_name: str, args: tuple, kwargs: dict) -> None:
    # Own process group: killing it also kills grandchildren (Demucs, ffmpeg).
    try:
        os.setpgrp()
    except OSError:
        pass
    import importlib
    import resource

    try:
        fn = getattr(importlib.import_module(target_module), target_name)
        result = fn(*args, **kwargs)
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
        child_rss = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024.0
        conn.send(("ok", result, {"peak_rss_mb": round(rss, 1), "peak_child_rss_mb": round(child_rss, 1)}))
    except BaseException as exc:  # noqa: BLE001 — everything must reach the parent
        status = getattr(exc, "status_code", 500)
        detail = getattr(exc, "detail", None) or f"{type(exc).__name__}: {exc}"
        try:
            conn.send(("error", int(status), str(detail)[:4000]))
        except Exception:
            pass
    finally:
        conn.close()


class JobTerminated(Exception):
    def __init__(self, reason: str, detail: str):
        super().__init__(detail)
        self.reason, self.detail = reason, detail


def run_in_worker(
    rec: JobRecord,
    registry: JobRegistry,
    target: tuple[str, str],
    args: tuple = (),
    kwargs: dict | None = None,
    timeout_s: float = 1080.0,
    poll_s: float = 0.25,
    preload: list[str] | None = None,
) -> tuple[object, dict]:
    """Runs target(*args, **kwargs) in a worker process. Returns (result,
    stats). Raises JobTerminated("timeout" | "cancelled" | "crashed", ...)
    or re-raises the worker's own error as WorkerError."""
    ctx = _mp_context(preload)
    parent_conn, child_conn = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_worker_entry, args=(child_conn, target[0], target[1], args, kwargs or {}), daemon=True)
    proc.start()
    child_conn.close()
    registry.transition(rec.job_id, "running", pid=proc.pid)
    deadline = time.monotonic() + timeout_s
    reason = None
    try:
        while True:
            if parent_conn.poll(poll_s):
                try:
                    msg = parent_conn.recv()
                except EOFError:
                    reason = "crashed"
                    break
                if msg[0] == "ok":
                    return msg[1], msg[2]
                raise WorkerError(msg[1], msg[2])
            if not proc.is_alive():
                # Exited without a message: killed (OOM killer) or crashed.
                if parent_conn.poll(0):
                    continue
                reason = "crashed"
                break
            if registry.get(rec.job_id) and registry.get(rec.job_id).cancel_requested:
                reason = "cancelled"
                break
            if time.monotonic() >= deadline:
                reason = "timeout"
                break
    finally:
        if proc.is_alive():
            _kill_group(proc)
        proc.join(timeout=10)
        parent_conn.close()
    code = proc.exitcode
    detail = {
        "timeout": f"Mastering exceeded its {timeout_s / 60:.0f}-minute limit and was stopped.",
        "cancelled": "Mastering was cancelled.",
        # SIGKILL (-9) without us killing it is the kernel OOM killer; any
        # other exit is a crash (e.g. an import failure exits 1).
        "crashed": f"The mastering worker was stopped by the system (exit code {code}), most likely out of memory."
        if code == -9
        else f"The mastering worker stopped unexpectedly (exit code {code}).",
    }[reason]
    raise JobTerminated(reason, detail)


class WorkerError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def _kill_group(proc) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except Exception:
            pass
