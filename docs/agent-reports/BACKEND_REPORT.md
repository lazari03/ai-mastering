# BACKEND REPORT (Discovery audit, Step 1) - backend-engineer
Commit audited: c88bc69 (+ dffd6c6 docs only). Read-only on source.

## Tests run
- `cd backend-node && npm ci && npm run lint && npm test`: npm ci OK, lint clean (0 problems), tests 63 / pass 63 / fail 0 / skipped 0 (~10 s).
- Python suite not run here (assigned elsewhere).

## AURALITH-BACKEND-001 (count-based concurrency, A12): RESOLVED
- backend/app/core/job_runner.py:140-215 `ResourceGovernor`: admission requires `reserved_mb + est_mb <= budget_mb` (`_fits`, :165-170) plus max_jobs and max_stem_jobs; FIFO queue with queue_max and wait deadline; est_mb > budget -> 413 `too_large_for_server` (:177).
- backend/app/core/job_runner.py:100-116 `CostModel.estimate_mb` scales with duration, sample rate, stems, reference.
- backend/app/api/routes/mastering.py:43-51 builds COST_MODEL + governor; :271 estimate, :283 `governor.admit(...)`; cancel of queued tickets :324.
- Not a count-only semaphore any more. Recommend kb status RESOLVED (validated_commit c88bc69).

## Python 500 on undecodable upload: Node side
- Python raises 500 `render_failed` with X-Error-Code (mastering.py:300). Node `postMultipartToPython` throws Error with `status=500`, `code=render_failed` (masteringService.js:225-228), re-wrapped keeping both (:458-461).
- Gateway maps to **502** (masteringRoutes.js:1169; only 503/504/413/409/499 pass through, other >=500 -> 502), body `{code:"render_failed", detail:'Mastering failed: "<JSON-quoted Python detail>"'}`. Raw Python text (e.g. NoBackendError) reaches the browser (F2).
- Reservation IS refunded: catch block `refundWithRetry(reservationId, ...)` at masteringRoutes.js:1141 (3 attempts; lease 25 min reconciler backstop, reservationLedger.js:33). No charge on this path. Python job files are removed by Python itself (mastering.py:300 path calls remove_job_files).

## Findings
| # | Sev | Component | Title | Evidence | Required fix |
|---|-----|-----------|-------|----------|--------------|
| F1 | P2 | node.upload | Unsupported-file-type rejection returns 500 "Something went wrong on our side" instead of 4xx | masteringRoutes.js:80-85 `cb(new Error(...))` has no status; server.js:176-179 -> 500 + generic message for errors without status | Give the filter error `status=415/400` + `code:"unsupported_format"` (or map in server.js); add test |
| F2 | P2 | node.upstream | Raw Python/internal error text forwarded to browser | masteringService.js:225 `JSON.stringify(payload.detail)`; masteringRoutes.js:1171 returns `error.message` | For 5xx upstream return a fixed message keyed by `code`; log the detail |
| F3 | P2 | node.upstream | Python unreachable -> 400 with internal URL and dev shell hint; permanent-looking status | masteringService.js:211-214 (no `.status`), masteringRoutes.js:1169 (`NaN>=500` false -> 400) | Tag with status 503 + code `engine_unavailable`, generic message; refund already happens |
| F4 | P2 | node.memory | `readFileSync` of full upload(s) + Blob copy per /master; up to 2x200 MB per request x concurrent requests, blocks event loop; no Node-side concurrency/memory admission | masteringService.js:200-201; limiter only 20 req/15 min/user (rateLimit.js:35) | Stream file from disk (fs.openAsBlob / createReadStream into multipart) and add a Node in-flight cap returning 503 |
| F5 | P3 | node.idempotency | Server generates a fresh jobId per request; ledger idempotency is unused for client retries/double-submit (two renders, two charges). Billing rule 9 documents disconnect-bills, but double-click is not covered | masteringRoutes.js (jobId = randomUUID, ~line 788); no Idempotency-Key handling anywhere in src | Optional client-supplied idempotency key mapped to reservationId; or frontend submit-lock (verify) |
| F6 | P3 | node.upstream | Python `Retry-After` / retry_after_s dropped on 503 at_capacity/queue_timeout | pythonUpstream.js:57 resolves only errorCode; route response (:1172) sets no header | Forward Retry-After header |
| F7 | P3 | node.cleanup | Preview excerpt file leaked on failure (only unlinked on success); swept after 2 h only | masteringRoutes.js:959,994 (unlink after success only); cleanupUploads.js:44 | unlink in catch/finally |
| F8 | P3 | node.errors | Pre-render JSON.parse of `tags`/`tweaks` happens after reservation; malformed input triggers reserve+refund+master_failed event instead of cheap 400 before reservation (violates "validate before reserve" comment at :771) | masteringRoutes.js:~947-948 inside try after :936 reserve | Parse/validate tags/tweaks with processing, before reserve |
| F9 | P3 | node.errors | normalizeMasteringFailure uses substring heuristics; "Cannot reach Python service" and 502 render_failed bucket as generic `server_error` (ignores `error.code`) | analyticsService.js:545-562 | Prefer `error.code` when present |

No P0/P1 found on the Node /master billing path: reservation precedes render, every catch path refunds, complete is after job record, 409 withdraws unpaid master.

## Test gap table (required list vs existing)
| Area | Exists | Missing |
|------|--------|---------|
| Concurrency | reservationLedger.test.js: "five concurrent requests with ONE remaining master", "five concurrent stem renders...", "two reconcilers at once" | Route-level concurrent /master; Node in-flight cap (none exists) |
| Processing failure | ledger: "failure before processing refunds everything", "failure during processing refunds; second refund no-op" | Route-level: Python 500/502 -> status, code, refund called (no masteringRoutes tests at all) |
| Timeouts | pythonUpstream.test.js: "a render past the deadline fails with a 504 processing_timeout" | Route-level 504 triggers refund + cancelPythonJob + deleteJobFiles |
| Cancellation | ledger: "cancellation and completion racing" | Client disconnect behaviour; cancel propagation to Python |
| Worker crash | ledger: "worker/gateway crash: abandoned reservation refunded, upstream stopped"; "retry after restart ... completed" | Python `worker_crashed` 500 mapping through gateway |
| Refunds | ledger: refund idempotency, month boundary (3 tests), stem-not-run refund, "stale worker can't complete refunded job" | `refundWithRetry` retry/backoff; 409 reservation_expired route path |
| Duplicates | ledger: "reserving same id twice charges once", "another user can't reuse id" | Route-level double submit (F5) |
| Resource exhaustion | none on Node (Python governor tested elsewhere) | Node memory/in-flight (F4); 503/413 passthrough + Retry-After |
| DB interruption | ledger: "Firestore outage during refund", "reserve fails mid-transaction no partial charge" | Route: readUserData failure fails closed (402/503), recordJob failure after render, complete() failure -> reconciler |
| Invalid uploads | none | audioFileFilter rejection status (F1), LIMIT_FILE_SIZE 413, missing file 400, bad processing JSON 400, undecodable -> Python 500 mapping, ECONNREFUSED mapping (F3) |
| Other uncovered | pythonUpstream passthrough test | jobsService (no tests), cleanupUploads middleware, postMultipartToPython error mapping, deleteJobFiles |
