# Production hardening (pass 2)

This builds on the previous commit (CI gates, stem reservation, the 19-min upstream deadline, the
duration cap). Companion reports:
* JOB_LIFECYCLE_AND_BILLING.md
* RESOURCE_BENCHMARKS.md
* AUDIO_VALIDATION.md
* PROFESSIONAL_ROADMAP.md
* RELEASE_READINESS_V2.md

## Defects, root causes, fixes

| # | Sev | Defect | Root cause | Fix | Files |
|---|---|---|---|---|---|
| 1 | P1 | One 15-min job (about 5 GB) plus two others could OOM the box; the cap counted jobs, not memory | `threading.BoundedSemaphore(3)` | Admission by estimated peak memory (measured cost model) against a budget taken from the env, the cgroup limit or host RAM. A separate stem-job cap, a bounded FIFO queue with explicit 503 `at_capacity` / `queue_timeout` and Retry-After, and 413 `too_large_for_server`. Released in `finally` | `backend/app/core/job_runner.py` (new), `app/api/routes/mastering.py`, `app/core/config.py` |
| 2 | P1 | A timed-out or abandoned render kept running (and kept Demucs and ffmpeg running), then wrote files nobody received | The render ran on a server thread; threads can't be killed | Every `/master` render runs in a forkserver worker in its own process group. Cancel, timeout or crash SIGKILLs the whole group (grandchildren included). The first terminal state wins; a late result is discarded and its files deleted | `job_runner.py`, `mastering.py` route, `app/services/mastering_service.py` (`stage_mastering_request`, `render_staged_job`, `remove_job_files`) |
| 3 | P1 | Python did not know the gateway's deadline | No deadline propagation | Node sends `job_id` and `deadline_epoch_ms`. Python stops at `min(job timeout, deadline − 30 s)` and returns 504 `processing_timeout` first. Node also cancels on its own timeout | `backend-node/src/services/masteringService.js`, `routes/masteringRoutes.js` |
| 4 | P1 | Reservations lived only in request memory: a restart lost the slot, and a Firestore outage during refund lost it too | No persistent record | Durable `renderReservations/{jobId}` ledger with the state machine, idempotent transitions, a lease and a reconciler | `backend-node/src/services/reservationLedger.js` (new), `routes/masteringRoutes.js`, `server.js`; `renderReservation.js` removed (all its scenarios are covered by the ledger tests) |
| 5 | P1 | Stem jobs over ~6 min could never finish (Demucs ft at 2.33× realtime against an 18-min timeout), but held about 4 GB and the stem slot until timeout | No duration check for stems | 413 `stems_too_long` before admission, from the measured rates (configurable); refunded | `mastering.py` route, `config.py` |
| 6 | P2 | Crash message blamed memory for every worker exit | Generic wording | Says "out of memory" only for SIGKILL (exit −9) | `job_runner.py` |
| 7 | P2 | Backend error reasons were English-only free text | No machine-readable code | `X-Error-Code` → Node `{code, detail}` → frontend `masterError.<code>` (en/sq, 18 codes) with fallback to the detail | `pythonUpstream.js`, `masteringService.js`, `masteringRoutes.js`, `frontend/src/lib/masteringErrors.js` (new), `store/masteringStore.js`, `MasteringConsole.jsx`, `NotificationBanner.jsx`, `lib/i18n.js` |
| 8 | P2 | Source warnings were English-only | Free text | Each warning carries `{code, params, text}` in `processing_applied.source_warning_codes`; the UI localizes it (en/sq, 22 keys) and falls back to the text | `ai_mastering/mastering.py`, `mastering_service.py`, `masteringRoutes.js`, `MasteringConsole.jsx`, `MasterResultView.jsx`, `i18n.js` |
| 9 | P2 | Quiet audio was called "digital silence" | One message for two conditions | Separate messages; threshold unchanged | `ai_mastering/quality_control.py` |
| 10 | P2 | DC offset and L/R imbalance were detected but never shown | `input_validation.issues` not surfaced | Shown as source warnings (existing thresholds) | `ai_mastering/mastering.py` |
| 11 | P3 | Cost model was a guess | — | Set from measurements: base 450 MB, +310 MB/min, stem +3700 MB | `config.py` |
| 12 | Test | `test_queue_overload…` asserted that the queued job *fails*. It actually (correctly) runs once the slot frees, and the failure was hidden in a thread warning | Wrong expectation | Asserts the job is admitted, and passes under `-W error::PytestUnhandledThreadExceptionWarning` | `backend/tests/test_job_runner.py` |

## New interfaces

* Python:
  * `POST /jobs/{id}/cancel` (idempotent);
  * `GET /jobs/{id}`;
  * `GET /capacity` (budget, reservations, queue, cost model, `max_stem_duration_s`);
  * `/master` accepts `job_id` and `deadline_epoch_ms`;
  * errors carry `X-Error-Code`.
* Node: the `/master` error JSON is `{code, detail}`; statuses 503/504/413/409/499 are passed through.
* New env vars, with defaults that preserve today's behaviour on a 16 GB box:

  | Variable | Default |
  |---|---|
  | `MASTERING_MEMORY_BUDGET_MB` | 0 = auto |
  | `MASTERING_MAX_CONCURRENT_STEM_JOBS` | 1 |
  | `MASTERING_QUEUE_MAX` | 6 |
  | `MASTERING_QUEUE_WAIT_SECONDS` | 120 |
  | `MASTERING_JOB_TIMEOUT_SECONDS` | 1080 |
  | `MASTERING_COST_*` | measured values (see above) |
  | `MASTERING_STEM_SECONDS_PER_AUDIO_SECOND` | 2.4 |
  | `MASTERING_MASTER_SECONDS_PER_AUDIO_SECOND` | 0.6 |
  | `RESERVATION_RECONCILE_INTERVAL_MS` | 300000; 0 disables |

## Behaviour changes a user can notice

* Busy server: an explicit, localized "busy, nothing charged" message after up to 120 s of queueing,
  instead of an immediate 503. This replaces the old semaphore's behaviour.
* Stems on tracks longer than ~6 min (4 vCPU): refused up front and refunded. Before, the job ran 18 minutes and then failed.
* Two new informational warnings (DC offset, channel imbalance) can appear.

## Tests and results (executed in this session)

| Suite | Result |
|---|---|
| Python `pytest -q -p no:warnings` (whole suite) | **229 passed** (548 s) |
| Synthetic regression vs baseline | **0 drift**, 21 tracks |
| Node `npm test` | **63 passed** (18 new ledger tests; 7 old reservation tests removed with the module) |
| Node `npm run lint` | clean |
| Frontend `npm run build` | OK |
| Route import smoke test (`masteringRoutes.js`) | OK |
| Live cancellation on a 3-min render via uvicorn | 499 within 1.5 s, worker group killed, 0 files left, `reserved_mb` back to 0 |
| Localization helper (Node script) | Codes, params, channel name and reason composition; unknown code and legacy record fall back to text |

CI runs all of these automatically. The new Python tests are picked up by `pytest`
and the new Node tests by the `__tests__` glob. CI run #200 (the previous commit) was **green on GitHub for every
job**. This working tree has **not** run on GitHub yet.
