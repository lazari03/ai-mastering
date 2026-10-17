# Database audit: Firestore and the gateway's local SQLite stores

| | |
|---|---|
| Audit date | 2026-10-15 |
| Commit | `e441297`. The working tree had unrelated uncommitted edits from another agent; none touch DB code. Line numbers refer to `e441297`. |
| Role | database-engineer. No product code was changed. |
| Scope | Every Firestore read and write in `backend-node/src` (`services/*`, `middleware/auth.js`, `middleware/requireAdmin.js`, `routes/webhookRoutes.js`). Also the SQLite stores `config/jobsDb.js` (jobs, share links) and `config/analyticsDb.js`. Covered: transactions, N+1 reads, unbounded scans, indexes and rules, ownership, retention, and local DB growth, backup and locking. |
| Tools | Code reading and grep, `npm test`, throwaway `node:test` files in the session scratchpad: real `better-sqlite3` on temp files, and the repository's `fakeFirestore.js`. |
| Limitations | No Firestore emulator: index requirements, `!=`-on-map queries and transaction contention are judged by reading. `firestore.rules` is git-ignored and was not available. No production data was touched. |

Known issues not repeated here: AURALITH-DEVOPS-006 (no volume backups) and AURALITH-DEVOPS-007 (unbounded cache/analytics storage, retention in general).

## Data map

| Store | Collections or tables | Writers |
|---|---|---|
| Firestore | `users/{uid}` (+ `artists` subcollection), `renderReservations`, `processedPolarOrders`, `purchaseEvents`, `webhookFailures`, `adminNotifications`, `newsletterSubscribers`, `presets` | gateway only (firebase-admin) |
| SQLite `data/jobs.db` (WAL) | `jobs` (PK `uid, job_id`), `share_links` | `jobsService.js`, `shareLinkService.js` |
| SQLite `data/analytics.db` (WAL) | `analytics_visitors`, `analytics_sessions`, `analytics_events` | `analyticsService.js` |

Both SQLite files live on the `analytics_db` named volume (`docker-compose.yml:43`) and are accessed by a single process with synchronous `better-sqlite3` on the main event loop.

## Summary

| ID | Sev | Title | Evidence |
|---|---|---|---|
| DB-01 | P2 | `jobs` table has no retention; every preview (anonymous ones included) adds a permanent row with JSON blobs | verified by test |
| DB-02 | P2 | `listJobs` hides real masters behind newer previews (paid master missing from My Masters) | verified by test |
| DB-03 | P2 | Admin analytics endpoints load caller-chosen unbounded date ranges synchronously and block the event loop | by reading |
| DB-04 | P2 | Admin user list walks Firebase Auth without a cap when anonymous accounts dominate; up to about 1,200 doc reads per page | by reading |
| DB-05 | P3 | Subscription mirror written outside transactions (reconcile, backfill, change-plan): racy read-modify-write | verified by test (see PAYMENTS PAY-03) |
| DB-06 | P3 | Reconcile pass scans every user who ever subscribed, every 6 h, with sequential Polar calls | by reading |
| DB-07 | P3 | No TTL on `renderReservations`, `webhookFailures`, `purchaseEvents`, `adminNotifications`, `processedPolarOrders` | by reading |
| DB-08 | P3 | Migrated columns `tweaks`, `category`, `flavour`, `level_diagnostics` are never written | verified by test |
| DB-09 | P3 | Per-master Firestore cost: an "informational" `markProcessing` transaction adds 1 read and 1 write | by reading |
| DB-10 | P3 | SQLite is per-container: more than 1 `node-api` replica breaks ownership, reconciler and share links; no consistent-snapshot backup | by reading |
| DB-11 | info | Indexes and rules: no composite index needed today; rules unavailable | by reading, unverified |

## Verified findings

### DB-01 · P2 · node.jobs — no retention on `jobs`
- Evidence: `jobsService.js:96` (`RETENTION_HOURS` is used only to *label* `expires_at`, `:179`). The only DELETEs are per job and per user (`:159-160`).
- Every `/master`, previews included, upserts a row carrying `analysis_before/after`, `processing_applied`, `quality_control` and `target_profile_used` JSON (`masteringRoutes.js:1060-1084`). Previews are open to anonymous uids.
- Impact: unbounded growth on the shared volume, driven by unauthenticated preview traffic. `ownsJob` keeps authorising downloads for expired rows (harmless only because files are swept at 48 h).
- Test: D2. Rows set to expire in 2000 are still present, and no sweep exists.
- Fix: an hourly `DELETE FROM jobs WHERE expires_at < ?` (index `expires_at`). Optionally keep non-preview metadata longer and drop the blobs. Effort S. Confidence high.

### DB-02 · P2 · node.jobs — My Masters can be empty
- Evidence: `jobsService.js:249-255` fetches `limit*2` (50) newest rows, *then* filters `preview` in JS.
- Impact: a user who previews 50 times after a paid master sees an empty My Masters (the master remains downloadable by URL).
- Test: D1 returns `[]` while `ownsJob` is true.
- Fix: `WHERE uid = ? AND preview = 0 ORDER BY created_at DESC LIMIT ?`, plus an index `(uid, preview, created_at)`. Effort S.

### DB-03 · P2 · node.analytics — synchronous full-range scans
- Evidence:
  - `analyticsQueryService.js:125-131` accepts any `from`/`to`.
  - `:165`, `:177`, `:185` and `analyticsBehaviorService.js:208-209` run `SELECT *` over the range and aggregate in JS.
  - `analyticsBehaviorService.js:32` and `:39` load the whole `analytics_visitors` uid map on every call.
  - `getLive` (`:675`) has no limit either.
- Root cause: `better-sqlite3` is synchronous on the gateway's only event loop.
- Impact: one admin request for a long range freezes `/master` responses, Polar webhooks (Polar retries) and auth for seconds. It worsens with unbounded analytics growth (DEVOPS-007).
- Fix:
  - Cap the range (for example 400 days).
  - Push aggregation into SQL (`COUNT … GROUP BY`).
  - Or run admin queries in a `worker_thread` with a read-only connection.
- Effort: M. Confidence: high for the code. No timing was measured.

### DB-04 · P2 · node.admin — unbounded Auth walk
- Evidence: `adminUsersService.js:103-109` loops `auth.listUsers(1000)` until 200 *non-anonymous* users are collected, with no page cap when there is no search term (the search branch has `MAX_SEARCH_SCAN`, 5000). It then calls `db.getAll` on every collected record (`:114-116`), which can reach 1,199 docs because a full 1000-user page is appended before the check.
- Root cause: every public-tool visitor mints an anonymous Auth user that is never deleted.
- Impact: the admin page's latency and Auth quota grow with total anonymous visitors. Each page load costs up to about 1.2k Firestore reads.
- Fix:
  - Cap pages per request (for example 5) and return a cursor.
  - Slice to the page size before `getAll`.
  - Enable automatic clean-up of anonymous accounts (Identity Platform), or delete them with a scheduled job.
- Effort: S–M.

### DB-05 · P3 · billing.polar — racy subscription writes
- Evidence: `polarService.js:313`, `:697` and `:756-758`. These are plain `get` then `set` with no transaction and no `modifiedAt` comparison, unlike the webhook path (`:556-561`).
- Tests: W7 and W8 in the payments scratch suite. Impact and fix: see PAYMENTS_AUDIT PAY-03.

### DB-06 · P3 · billing.polar — reconcile scan
- Evidence:
  - `polarService.js:710-725`: `users where subscription != null` plus `chordSubscription != null`, unpaginated. This set includes every user who *ever* subscribed, since the record is never cleared and is retained after account deletion (`profileService.js:162`).
  - It then makes one awaited Polar API call per uid.
  - `:744-762` adds one Firestore read per active Polar subscription.
- Impact: reads and Polar calls grow linearly, so the risk is Polar rate limits and a pass longer than the 6 h interval (passes can overlap; there is no lock).
- Fix:
  - Query only records that are entitled or ended recently (keep an `entitledUntil` timestamp field).
  - Paginate.
  - Add bounded concurrency and a running-flag guard.
- Effort: M.

### DB-07 · P3 · firestore — no TTL anywhere
- Evidence:
  - `renderReservations` terminal docs are kept forever (`reservationLedger.js:133-136`).
  - `webhookFailures` (`webhookRoutes.js:17`).
  - `purchaseEvents` (`polarService.js:117`), `adminNotifications` (`adminNotificationService.js:19`), `processedPolarOrders`.
- Fix:
  - Add `expireAt` fields and Firestore TTL policies: reservations 13 months after the terminal state, `webhookFailures` 30 days, notifications 90 days.
  - Keep `processedPolarOrders` for at least Polar's maximum redelivery and refund window.
- Effort: S.

### DB-08 · P3 · node.jobs — dead migrated columns
- Evidence: `jobsDb.js:64-83` adds 4 columns, and the upsert (`jobsService.js:135-156`) never names them.
- Test: D3 shows all four are NULL after `recordJob` with values supplied.
- Fix: write them, or drop them from `EXPECTED_COLUMNS`. Effort S.

### DB-09 · P3 · billing.ledger — per-render Firestore cost
- Evidence, for one paid master:
  - `requireAuth` makes 1 read on a memo miss (`auth.js:181-185`).
  - `readUserData`: 1 read.
  - `reserve` transaction: 2 reads and 2 writes.
  - `markProcessing` transaction: 1 read and 1 write; the code calls it informational (`masteringRoutes.js:944-946`).
  - `complete`: 1–2 reads and 1–2 writes.
- That totals about 6 reads and 5 writes. There is no N+1. `/billing/checkout` reads `users/{uid}` twice (`getPlan`, then `changeSubscriptionPlan`).
- Fix: drop or fold `markProcessing`, and pass the snapshot into `changeSubscriptionPlan`. Effort S. Low priority.

### DB-10 · P3 · node.sqlite — single-instance assumption and backup
- Evidence: the ownership checks for every download, codec preview and share (`jobsService.js:209-212`), the reconciler's delivered-or-abandoned decision (`masteringRoutes.js:68-76`) and share links all read a container-local file.
- Impact:
  - Scaling `node-api` beyond 1 replica silently breaks these paths (404s, or refunds of delivered work).
  - Copying the volume while WAL is active can produce an inconsistent backup (backups are absent anyway: DEVOPS-006).
  - Locking is fine with one process.
- Fix:
  - Document the single-replica constraint in `docker-compose.yml`.
  - Back up with `VACUUM INTO` or `sqlite3 .backup`.
  - Move jobs to Postgres or Firestore before any scale-out.
- Effort: S (document and back up) or L (move).

## Unverified concerns
- **DB-11 Indexes**: there is no `firestore.indexes.json` in the repo, and current queries do not need one:
  - single-field range queries: `renderReservations.leaseExpiresAt <=`, `users.createdAt >=`, `purchaseEvents.at >=`, `adminNotifications` order by `createdAt` and `readAt == null`;
  - an equality-only pair: `subscription.status == … AND subscription.productId == …` count (`analyticsQueryService.js:231`).
  - `where("subscription", "!=", null)` on a **map** field relies on the map field's automatic index. This should be confirmed on the emulator, and an exemption on `users.subscription` would break reconciliation silently.
- **Rules**: `firestore.rules` is git-ignored (`.gitignore`). The frontend has no Firestore SDK (grep of `frontend/src`), so production rules should deny all client access. This needs a console check; the impact if they are permissive is high.
- **Ownership**: every job, file and preset read is uid-scoped (SQLite PK `(uid, job_id)`; presets under `users/{uid}/artists`; share links resolved by token hash). Verified by reading. `getJob(claim.uid, …)` on legacy share routes trusts the HMAC claim (security scope).
- **Account deletion**: `deleteSubcollection` uses one batch (500-op limit), which is safe while `MAX_USER_PRESETS = 100`. The 100-preset cap is a non-transactional count, so concurrent creates can slightly exceed it.

## Tests performed
- `npm test`: 71/71 pass (working tree; includes another agent's uncommitted `clientError.test.js`).
- Scratchpad `db.audit.test.mjs` (5/5 pass, assertions encode the defect):
  - D1 My Masters hidden;
  - D2 no retention;
  - D3 dead columns;
  - D4 spurious conflict (PAY-05);
  - D5 delivered master refunded (PAY-06).
- Scratchpad `payments.audit.test.mjs` W2, W7, W8 for the Firestore write paths. Nothing was added to the repository.

## Recommendations (in order)
1. DB-02 (one-line SQL fix plus a test).
2. DB-01 retention sweep.
3. DB-03 range cap and worker.
4. DB-05: one guarded transactional writer for subscription records (shared with PAY-02 and PAY-03).
5. DB-04 Auth walk cap and anonymous-account clean-up.
6. DB-07 TTL policies.
7. Emulator CI job running the ledger, webhook and reconcile tests (closes DB-11 and the emulator gap in `JOB_LIFECYCLE_AND_BILLING.md`).

## Remaining risks
- No emulator: the transaction retry behaviour of real Firestore under contention (the fake serializes transactions), the index needs, and the `!=` query semantics are assumptions.
- Production rules and data volumes were not seen. All growth claims are structural; nothing was measured.
- SQLite on a single volume with no backup (DEVOPS-006) is also the ledger's source of truth for "was this delivered".
