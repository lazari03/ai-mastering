# Architecture (Level 2)

validated_commit: c88bc69 · owner: technical-lead · sources listed per section.
If a path below no longer exists, mark this section STALE in your handoff.

## Services
| Service | Path | Runtime | Port | Role |
|---|---|---|---|---|
| frontend | `frontend/` | Next.js 16.3, React 18.3, Zustand 5, Tailwind 3 | 3000 | Marketing site, SEO tool pages, app (`src/app/app`), admin analytics |
| node-api | `backend-node/` | Node 22, Express 5, firebase-admin, Polar SDK, better-sqlite3 | 8000 | Auth (Firebase ID tokens), entitlements, reservation ledger, jobs, share links, presets, analytics, Polar webhooks, proxies DSP |
| python-service | `backend/` | Python 3.12 (Docker), FastAPI, numpy/scipy/pyloudnorm/pedalboard/librosa, Demucs, essentia/madmom | 8001 | All DSP: analyze, preview-params, master, codec preview, chord/key/BPM |
| caddy | `Caddyfile` | Caddy | 80/443 | TLS + routing |
| dozzle | compose | — | — | log viewer |
Source: `docker-compose.yml`, `Makefile`, `README.md`.

## Request flow: `POST /master` (customer path)
1. Frontend uploads (multipart) → node-api `POST /master` (`backend-node/src/routes/masteringRoutes.js:726`).
2. Node: auth → `expensiveLimiter` → multer → entitlement check → **reserve** a render in
   `renderReservations/{id}` in the same Firestore transaction as the quota counter
   (`services/reservationLedger.js`). State machine `reserved → processing → completed | refunded`.
3. Node forwards to Python `POST /master` with `job_id` and `deadline_epoch_ms` (`services/pythonUpstream.js`, `services/masteringService.js`).
4. Python (`backend/app/api/routes/mastering.py:186`): `resolve_mastering_config` → `stage_mastering_request`
   → `registry.create` (capacity) → `governor.admit` (memory-aware admission, `COST_MODEL`) →
   `run_in_worker` (killable process group, `app/core/job_runner.py`) → `ai_mastering.mastering.master_track`.
5. Terminal mapping: timeout→504 `processing_timeout`, cancel→499, crash→500 `worker_crashed`,
   invalid audio→400, too long→413, render failure→`render_failed`. Files removed on failure.
6. Node completes or refunds the reservation; writes job record (`config/jobsDb.js`); returns analysis + download URL.
7. Downloads: `GET /download/:jobId.:ext`, `/original/:jobId`, `/preview/:jobId` (Node proxies Python).
Detail and race analysis: `docs/audits/JOB_LIFECYCLE_AND_BILLING.md`.

## Python API surface (`backend/app/api/routes/`)
`GET /health /genres /tags /styles /delivery-targets /categories /mix-presets /capacity /jobs/{id}`
`POST /analyze /preview-params /master /jobs/{id}/cancel /codec-preview /analyze-chords`
`GET /download/{id}.{ext} /original/{id} /preview/{id} /download-codec-preview/{id}/{codec}` · `DELETE /files/{id}`
Note: `app/main.py` imports the chords router, which imports `essentia` at module load →
the full app cannot start without essentia. Harnesses that only need mastering mount `mastering_router` directly.

## Node API surface (`backend-node/src/routes/`)
Mastering/jobs/share/billing/presets in `masteringRoutes.js`; Polar in `webhookRoutes.js` (`POST /webhooks/polar`, raw body);
analytics in `analyticsRoutes.js`; admin in `admin*Routes.js` (`requireAdmin` / `requireAdminKey`).

## DSP pipeline (summary — details in DSP_KNOWLEDGE.md)
validate input → analyze → target profile (genre × tags × style × category) → adaptive corrections →
preset tweaks → M/S multiband → saturation/width → bus (glue, gain, true-peak limiter, loudness guard) →
QC + guardrail evaluation/backoff → output + A/B report. Engines: Standard / Professional (`ai_mastering/engines.py`).

## Data stores
Firestore: `users/{uid}` (plan, quotas, credits), `renderReservations`, jobs. SQLite: analytics (`analytics_db` volume).
Volumes: `mastering_uploads`, `mastering_outputs`, `mastering_cache`. Retention: `FILE_RETENTION_HOURS` (`app/core/config.py`).

## Tests and gates
| Suite | Command | CI job |
|---|---|---|
| Python unit/integration (~229) | `cd backend && python -m pytest -q` | python-tests |
| Synthetic regression (21 tracks) | `cd backend && python -m benchmark.regression --synthetic --baseline benchmark/baselines/synthetic.json` | synthetic-regression |
| Node tests (ledger races, webhooks, share links) | `cd backend-node && npm test` | node-check |
| Frontend | `cd frontend && npm run build` (no unit/e2e tests exist) | frontend-check |
| API-level audio QA (agent lab) | `cd backend && python -m benchmark.api_qa` | not in CI yet |
