"""Resource-aware admission and killable workers (app/core/job_runner.py)."""

from __future__ import annotations

import os
import threading
import time

import pytest

from app.core.job_runner import (
    CapacityError,
    CostModel,
    JobRegistry,
    JobTerminated,
    ResourceGovernor,
    WorkerError,
    resolve_memory_budget_mb,
    run_in_worker,
)

T = "job_targets"


def gov(budget=1000, jobs=3, stems=1, queue=4, wait=2.0):
    return ResourceGovernor(budget, jobs, stems, queue, wait)


# --- admission -------------------------------------------------------------

def test_several_short_jobs_run_together_within_budget():
    g = gov()
    with g.admit("a", 200, False), g.admit("b", 200, False), g.admit("c", 200, False):
        assert g.snapshot()["running"] == 3 and g.snapshot()["reserved_mb"] == 600
    assert g.snapshot()["running"] == 0 and g.snapshot()["reserved_mb"] == 0


def test_long_jobs_beyond_the_budget_wait_instead_of_overcommitting():
    g = gov(budget=1000, wait=5.0)
    peak = {"mb": 0}
    lock = threading.Lock()

    def job(name):
        with g.admit(name, 600, False):
            with lock:
                peak["mb"] = max(peak["mb"], g.snapshot()["reserved_mb"])
            time.sleep(0.3)

    threads = [threading.Thread(target=job, args=(f"j{i}",)) for i in range(3)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert peak["mb"] <= 1000, "no admitted set of jobs may exceed the budget"


def test_a_job_that_can_never_fit_is_refused_immediately():
    with pytest.raises(CapacityError) as err:
        with gov(budget=1000).admit("x", 1500, False):
            pass
    assert err.value.status == 413 and err.value.code == "too_large_for_server"


def test_mastering_and_demucs_share_the_budget_but_stems_have_their_own_cap():
    g = gov(budget=10000, jobs=3, stems=1, wait=0.3)
    with g.admit("stem1", 3000, True), g.admit("plain", 500, False):
        with pytest.raises(CapacityError) as err:  # a second stem job waits, then times out
            with g.admit("stem2", 3000, True):
                pass
        assert err.value.code == "queue_timeout"
        with g.admit("plain2", 500, False):  # ordinary mastering still admitted
            assert g.snapshot()["running_stem_jobs"] == 1


def test_queue_overload_is_an_explicit_503_not_an_unbounded_pile_up():
    g = gov(budget=100, jobs=1, queue=1, wait=3.0)
    with g.admit("running", 100, False):
        outcome = []

        def queued():
            with g.admit("queued", 100, False):  # holds the one queue place
                outcome.append("admitted")

        waiter = threading.Thread(target=queued)
        waiter.start()
        time.sleep(0.2)
        with pytest.raises(CapacityError) as err:
            with g.admit("overflow", 100, False):
                pass
        assert err.value.status == 503 and err.value.code == "at_capacity" and err.value.retry_after_s
    waiter.join()
    assert outcome == ["admitted"], "the queued job runs once the slot frees"


def test_resources_are_released_when_the_job_raises():
    g = gov()
    with pytest.raises(RuntimeError):
        with g.admit("boom", 500, True):
            raise RuntimeError("render failed")
    snap = g.snapshot()
    assert snap["reserved_mb"] == 0 and snap["running"] == 0 and snap["running_stem_jobs"] == 0


def test_cancelling_a_queued_job_frees_its_place():
    g = gov(budget=100, jobs=1, wait=5.0)
    out = {}
    with g.admit("running", 100, False):
        def wait():
            try:
                with g.admit("queued", 100, False):
                    out["ran"] = True
            except CapacityError as e:
                out["code"] = e.code
        t = threading.Thread(target=wait)
        t.start()
        time.sleep(0.2)
        assert g.cancel_queued("queued")
        t.join(3)
    assert out == {"code": "cancelled"} and g.snapshot()["queued"] == 0


def test_cost_model_scales_with_length_rate_and_stems():
    m = CostModel(worker_base_mb=700, per_audio_minute_mb=300, stem_extra_mb=3000, reference_extra_mb=150)
    assert m.estimate_mb(600, False) == pytest.approx(700 + 3000)
    assert m.estimate_mb(600, False, sample_rate=88200) == pytest.approx(700 + 6000)
    assert m.estimate_mb(600, True, reference=True) == pytest.approx(700 + 3000 + 3000 + 150)


def test_explicit_budget_wins_and_derived_budget_is_reported():
    assert resolve_memory_budget_mb(5000) == (5000.0, "MASTERING_MEMORY_BUDGET_MB")
    mb, source = resolve_memory_budget_mb(0)
    assert mb > 0 and source


# --- workers ---------------------------------------------------------------

def _rec(reg, jid):
    return reg.create(jid)


def test_worker_result_and_peak_memory_are_returned():
    reg = JobRegistry()
    result, stats = run_in_worker(_rec(reg, "w1"), reg, (T, "ok"), (42,), timeout_s=60)
    assert result == {"value": 42} and stats["peak_rss_mb"] > 0


def test_deadline_kills_the_worker():
    reg = JobRegistry()
    t0 = time.monotonic()
    with pytest.raises(JobTerminated) as err:
        run_in_worker(_rec(reg, "w2"), reg, (T, "sleep"), (60,), timeout_s=1.0)
    assert err.value.reason == "timeout" and time.monotonic() - t0 < 10


def test_cancel_during_processing_kills_worker_and_grandchild(tmp_path):
    reg = JobRegistry()
    rec = _rec(reg, "w3")
    pidfile = tmp_path / "grandchild.pid"
    threading.Timer(1.5, lambda: reg.request_cancel("w3")).start()
    with pytest.raises(JobTerminated) as err:
        run_in_worker(rec, reg, (T, "spawn_grandchild_and_hang"), (str(pidfile),), timeout_s=60)
    assert err.value.reason == "cancelled"
    gpid = int(pidfile.read_text())
    for _ in range(50):
        try:
            os.kill(gpid, 0)
        except ProcessLookupError:
            break
        # A killed grandchild is reaped by init; until then it may linger.
        if os.path.exists(f"/proc/{gpid}/stat") and open(f"/proc/{gpid}/stat").read().split()[2] == "Z":
            break
        time.sleep(0.1)
    else:
        pytest.fail("the Demucs-like grandchild survived cancellation")


def test_worker_crash_is_reported_not_hung():
    reg = JobRegistry()
    with pytest.raises(JobTerminated) as err:
        run_in_worker(_rec(reg, "w4"), reg, (T, "crash"), timeout_s=60)
    assert err.value.reason == "crashed" and "exit code" in err.value.detail


def test_worker_http_errors_keep_their_status():
    reg = JobRegistry()
    with pytest.raises(WorkerError) as err:
        run_in_worker(_rec(reg, "w5"), reg, (T, "bad_input"), timeout_s=60)
    assert err.value.status == 400 and "silence" in err.value.detail


# --- registry --------------------------------------------------------------

def test_first_terminal_state_wins_and_cancel_is_idempotent():
    reg = JobRegistry()
    reg.create("r1")
    reg.transition("r1", "running")
    assert reg.transition("r1", "completed").state == "completed"
    assert reg.transition("r1", "cancelled").state == "completed", "a delivered job is never re-labelled"
    assert reg.request_cancel("r1").cancel_requested is False
    reg.create("r2")
    reg.request_cancel("r2")
    reg.request_cancel("r2")
    assert reg.get("r2").cancel_requested is True


def test_duplicate_job_id_while_running_is_refused():
    reg = JobRegistry()
    reg.create("d1")
    with pytest.raises(CapacityError) as err:
        reg.create("d1")
    assert err.value.status == 409
