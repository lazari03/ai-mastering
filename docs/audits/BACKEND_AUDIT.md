# Backend Audit (Python FastAPI + Node gateway)

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · agents: backend-engineer role (technical-lead), database-engineer, payments-engineer.
Scope: error mapping, upload validation, job listing, billing/data-layer review. Prior detail: `docs/agent-reports/BACKEND_REPORT.md`,
`docs/audits/JOB_LIFECYCLE_AND_BILLING.md`, `DATABASE_AUDIT.md`, `PAYMENTS_AUDIT.md` (new).
Tools: pytest (Python 3.12 venv), `node --test`, eslint, throwaway billing tests.

## Fixed this session (each with a regression test that fails on `e441297` and passes now)
| Issue | Change | Files | Test |
|---|---|---|---|
| BACKEND-002 | Python unreachable → **503 `service_unavailable`** (was 400 with internal URL + dev command). Python 5xx / unexpected gateway errors → generic detail, `code` kept, internals logged | `backend-node/src/services/clientError.js` (new), `masteringService.js`, `masteringRoutes.js` (`/master`, `/analyze`, `/codec-preview`, file proxy) | `clientError.test.js` |
| BACKEND-003 | Rejected file type → **415 `unsupported_format`** (was generic 500); global handler forwards `code` for 4xx | `masteringRoutes.js` (fileFilter), `server.js` | (mapping covered by `clientError.test.js`) |
| BACKEND-006 | Undecodable compressed upload → **400 `invalid_audio`**, ffmpeg stderr to log only (was 500 with stderr) | `backend/app/services/mastering_service.py` | `tests/test_error_codes.py` |
| BACKEND-008 | `output_format` 400 carries `X-Error-Code: invalid_request` | same | same |
| BACKEND-011 (DB-02) | "My Masters" filtered previews *after* `LIMIT` → paid masters vanished after 50 previews. Filter in SQL + index `(uid, preview, created_at)` | `jobsService.js`, `config/jobsDb.js` | `listJobs.test.js` |
| SECURITY-009 | codec-preview 500 detail generic + coded | `backend/app/api/routes/mastering.py` | — |

API compatibility: existing codes unchanged; two codes added (`service_unavailable`, `unsupported_format`) and localized en+sq in
`frontend/src/lib/i18n.js` / `masteringErrors.js`. Status changes: unreachable 400→503, bad type 500→415, decode 500→400,
unexpected gateway error 400→500. Frontend falls back to `detail` for unknown codes.

## Open (from this session's data/payments review)
| Issue | Sev | Summary |
|---|---|---|
| BACKEND-009 | P2 | Out-of-order Polar event for an *older* subscription overwrites the active one (timestamp check ignores subscription id) — verified by throwaway test |
| BACKEND-010 | P2 | Reconciliation picks newest-started subscription even if inactive; no staleness check |
| BACKEND-012 | P2 | `jobs` table has no retention |
| BACKEND-013 | P2 | Admin analytics: unbounded synchronous SQLite scans block the event loop; uncapped Auth user walk |
| P3 bundle | P3 | refund-before-payment ordering; 402 under concurrency despite credits; 30 s preview downloadable at full quality; unused ledger-bypassing helpers exported; TTLs; single-replica SQLite (see PAYMENTS/DATABASE audits) |
Billing changes were **not** made: they alter live subscription state handling and go through backend → payments → security → QA → auditor with Polar sandbox.

## Tests
- `pytest` full suite: see QA_REPORT.md (baseline 271 passed before changes).
- Node: lint clean; **72/72** (68 baseline + 3 clientError + 1 listJobs).

## Remaining risks
No Firestore emulator / Polar sandbox: billing behaviour verified by fakes and reading only. QA-003 (route-level `/master` tests through Express) still open.
