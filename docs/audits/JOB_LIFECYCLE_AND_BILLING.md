# Job lifecycle and billing

Scope: what happens to a `/master` request, and to the user's quota or credits,
from upload to delivery or refund, including every failure, race and
recovery path. Code: `backend-node/src/services/reservationLedger.js`,
`backend-node/src/routes/masteringRoutes.js` (`/master`, `reconcileReservations`),
`backend-node/src/server.js` (reconciler timer), `backend/app/core/job_runner.py`,
`backend/app/api/routes/mastering.py`.

## Defect this replaces

`renderReservation.js` (previous commit) took the counters before the render and gave them back in
the request's `catch`. That fixed concurrent over-spending, but the reservation
existed only in the memory of the request:

| Failure | Old behaviour |
|---|---|
| Node restarts or crashes mid-render | Slot taken, never returned (lost master). |
| Firestore unavailable when the refund is written | Refund logged as lost; manual correction. |
| Gateway times out but Python keeps rendering | Python finished a master nobody received and kept the files; the slot was refunded anyway. |
| Duplicate settle (retry, two code paths) | No idempotency key; depended on code-path discipline. |
| A slot taken in October refunded in November | Handled by `refundMonthly`, but only from the in-request path. |

## The ledger

One document per render, `renderReservations/{jobId}`, written **in the same
Firestore transaction** as the counter it charges. So a charge cannot exist
without its reservation, and the reverse can't happen either.

```
reserved ──> processing ──> completed      parts: held → kept
    │             │                               held → refunded | expired
    └─────────────┴──────> refunded
```

* **Id**: the Node-generated `jobId` (32 hex characters). The same id is the Python job id, the
  cancellation handle and the job record key.
* **Parts**: `master` and optionally `stem`. Each has the shape `{kind: quota|credit, counter, limit, month, status}`. The counters and
  month semantics match `entitlementsService.js`:
  * `freeMasterUsage`: lifetime.
  * `masterQuota` and `stemQuota`: `{month, used}`.
  * `extraMasterCredits` and `extraStemCredits`.
* **Idempotent**:
  * `reserve` on an existing id returns the existing reservation (a retry charges once).
  * Another uid using that id gets a 403.
  * `complete` and `refund` are transitions conditioned on the current state, so the first terminal transition wins. Later ones return `{ok:false, state}` and change nothing.
* **Month boundary**: a monthly slot reserved in month M and refunded in M+1
  is marked `expired`, not refunded. M's count has already reset, and decrementing M+1's count would mint a master.
  Credits and the Free lifetime trial are always refunded, because they never reset.
* **Lease**: `leaseExpiresAt = createdAt + 25 min`. That is longer than the gateway's 19-min deadline, and longer than
  Python's 18-min job timeout. So no live render is ever reconciled while it runs.
* **No migration**: existing user documents are read as they are. Nothing is
  rewritten except the counters a render actually spends.

## Request flow (`POST /master`, non-preview)

1. Validate the request; read the entitlement snapshot (fails closed). Return a 402 with a specific message if nothing is
   available.
2. `ledger.reserve`. On a Firestore error, return **503 `billing_unavailable`** with nothing charged (fails closed).
   If a concurrent request took the last slot, return **402 `master_reservation_conflict` / `stem_reservation_conflict`**.
3. `markProcessing` (best-effort; the lease, not this state, drives recovery).
4. `processMastering({jobId, deadlineEpochMs: now + 19 min})`. Python:
   * stages the upload;
   * refuses a stem job that can't finish in time (413 `stems_too_long`);
   * admits by memory and stem slots (503 `at_capacity` / `queue_timeout`, 413 `too_large_for_server`);
   * runs the render in a killable worker process group;
   * stops it at `min(job timeout, deadline − 30 s)` (504 `processing_timeout`).
5. On success:
   1. `recordJob`, which is synchronous SQLite;
   2. then `ledger.complete(id, {refundStem: !stemSeparationRan})`.
   * The job record is written first, so a crash between the two steps leaves a reservation the reconciler
     **completes** (the job was delivered) rather than refunds.
   * If `complete` throws (outage), the master is delivered. The charge stays held and the reconciler completes it.
   * If `complete` reports `refunded` (the reconciler already gave up on this render), the job record and files are deleted.
     The response is **409 `reservation_expired`**. A master that wasn't paid for is never delivered.
6. On error:
   * `refundWithRetry` makes 3 attempts with 250 ms / 1 s backoff. If all fail, the reservation keeps its lease and the
     reconciler refunds it.
   * On `processing_timeout`, the gateway also calls `POST /jobs/{id}/cancel` and deletes `{jobId}_*` files. This covers clock skew or a lost response.
   * The response carries `{code, detail}`. The status is passed through for 503/504/413/409/499; other 5xx become 502.

Previews never reserve. Browser disconnects do **not** cancel the render: the
master is still recorded and shown in My Masters, and billed, because it was delivered
to the account. This behaviour is unchanged and deliberate.

## Reconciler

`reconcileReservations()` runs every 5 minutes, plus once 60 s after boot. It uses unref'd timers, and
`RESERVATION_RECONCILE_INTERVAL_MS=0` disables it.

1. Query `renderReservations` where `leaseExpiresAt <= now`. Terminal states set the lease to
   `null`, so they never match.
2. For each one: if a job record exists for `(uid, jobId)`, `complete` it; otherwise `refund("abandoned…")`
   and ask Python to cancel the job and delete its files.
3. Each settle is a conditioned transition, so two reconcilers (two instances, or a
   reconciler racing the request) settle each reservation exactly once.

> **Deployment note**: the query filters on a single field, `leaseExpiresAt`, which
> Firestore indexes automatically. No composite index is needed.

## Python job lifecycle (`app/core/job_runner.py`)

`JobRegistry` states are queued → running → completed | failed | cancelled |
timed_out. The first terminal state wins.

| Event | Result | Files |
|---|---|---|
| Cancel while queued | Removed from the queue; 499 `cancelled` | Deleted |
| Cancel while running | Worker process group SIGKILLed (within about 0.25 s); 499 | Deleted |
| Cancel arriving with the result | 499; the result is discarded | Deleted |
| Deadline passed before start | 504 `processing_timeout` | Deleted |
| Timeout while running | Group killed; 504 | Deleted |
| Worker dies (OOM SIGKILL / crash) | 500 `worker_crashed` | Deleted |
| Bad audio / too long | 400 `invalid_audio` / 413 `too_long` | Deleted |

The process group kill reaches Demucs and ffmpeg grandchildren (tested with a
grandchild that ignores its parent's death).

## Race and failure tests (executed)

Node `src/services/__tests__/reservationLedger.test.js` (18 tests) runs against an in-memory Firestore
with serialized transactions, deep-merge writes, type-bound range queries and
injected outages (`fakeFirestore.js`):

| Scenario | Result |
|---|---|
| 5 concurrent requests, 1 remaining master | Exactly 1 reserved |
| 5 concurrent stem renders, 1 stem credit | 1 runs; losers hold nothing (no master slot either) |
| Same id reserved twice (retry) | Charged once |
| Another user reuses the id | 403 |
| Failure before processing | Everything refunded |
| Failure during processing; a second refund | Refunded once; the second is a no-op |
| Firestore outage during refund | Nothing lost; the lease expires and the reconciler refunds |
| Gateway or worker crash (abandoned) | Refunded; upstream cancel requested |
| Restart, job was delivered | Completed, never refunded |
| Two reconcilers at once | Each reservation settled once |
| Cancel vs complete race | First terminal transition wins |
| Stale worker completes after refund | Rejected (`state: refunded`) |
| Stem separation didn't run | Master kept, stem refunded in one transaction |
| Month boundary (Oct reserve, Nov refund) | `expired`; no minted master |
| Month boundary via the reconciler | Same |
| Credits and Free trial across a boundary | Refunded (they never reset) |
| Free trial exhausted / legacy balances | Refused; documents read as they are |
| Reserve failing mid-transaction | No partial charge |

Python `tests/test_job_runner.py` (16 tests) and `tests/test_master_route_jobs.py` (8 tests) cover:
* FIFO admission, the memory budget, the stem cap, bounded-queue 503 and queue timeout;
* release on exception, queued cancel, and killing a hung grandchild;
* timeout and crash classification, and stale-result suppression;
* deadline already passed, and stem-too-long refusal;
* a real render in a worker.

Results: Node **63/63** pass, lint clean; Python job tests **24/24**.

## Not covered by automated tests

* `/master` itself is not exercised end to end against real Firestore. The route
  wiring is checked by lint, by the import smoke test and by the ledger tests; the live path
  was not run against a Firestore emulator in this session.
* Multi-instance deployments: the ledger is safe, but the Python `JobRegistry` is
  in-memory per Python process. The gateway must cancel on the instance that runs the job. Today there is
  one Python instance (`docker-compose.yml`).
