# Auralith Forge — Shared Knowledge Index (Level 1)

**Read this file first, and only this file, at the start of every task.**
Then load *only* the Level-2 entries your task needs (table below). Read source
code (Level 3) only to implement or verify. Summaries are navigation aids;
**current code wins over any summary**. Protocol: `.claude/workflows/knowledge-retrieval.md`.

Knowledge last validated against commit: `c88bc69` (2026-10-10).
Freshness check: `python3 .claude/knowledge/kb.py stale` lists entries whose
source files changed after their `validated_commit`.

## 30-second architecture
```
Browser ─ Next.js 16 / React 18 (frontend/, Zustand, Firebase Auth client, en+sq i18n)
   │ HTTPS via Caddy
Node 22 Express gateway (backend-node/)  ← auth, quotas, billing ledger, jobs DB, Polar webhooks
   │ internal HTTP, gateway deadline 19 min
Python FastAPI DSP service (backend/, port 8001) ← /master runs ai_mastering in a killable worker
   Firestore (users, renderReservations, jobs) · Polar (billing) · Demucs (stems) · essentia/madmom (chords)
```
Deploy: docker-compose on one VPS, GitHub Actions `deploy.yml` (tests + synthetic regression gate, then SSH `make deploy`).

## Level-2 entries — load only what your task needs
| File | Load when | Primary owner |
|---|---|---|
| `ARCHITECTURE.md` | cross-service change, API contract, data flow | technical-lead |
| `COMPONENTS.json` | find paths/tests/owner for a component (query with `kb.py component <name>`) | technical-lead |
| `DSP_KNOWLEDGE.md` | any change under `backend/ai_mastering/`, `params.py`, benchmark | audio-dsp-engineer |
| `TEST_BASELINES.json` | before re-running audio tests (reuse rule: hashes) | qa-automation-engineer |
| `BILLING_RULES.md` | quotas, credits, refunds, ledger, webhooks | backend-engineer |
| `PRODUCT_RULES.md` | plans, entitlements, pricing, features, localization | product-specialist |
| `DECISIONS.md` | before re-litigating any design choice | technical-lead |
| `KNOWN_ISSUES.json` | **before investigating any suspected defect** (`kb.py issues --component X`) | technical-lead |
| `RESOLVED_ISSUES.json` | suspect a regression of something already fixed | technical-lead |
| `AGENT_HANDOFFS.json` | picking up work another agent handed off (`kb.py handoffs --to <agent>`) | all |

Deep evidence (do not duplicate; link to it): `docs/audits/*.md` (prior audits,
measurements, lifecycle/billing design), `docs/agent-reports/*.md` (current agent reports),
`test-results/auralith-qa.json` (latest QA run, machine-readable).

## Hard constraints (apply to every agent)
1. No DSP threshold change without before/after measurements + regression test + rollback note.
2. Never weaken or skip a test; never hide a failure; never fabricate audio-quality or customer results.
3. Objective measurement ≠ listening evidence. Listening status is `PENDING` unless a human supplied it.
4. Never consume credits on a failed job; billing transitions go through `reservationLedger.js`.
5. Every user-facing string goes through the i18n layer (`frontend/src/lib/i18n.js`, en + sq).
6. No price changes, pushes, deploys, or real payments without explicit product-owner approval.
7. No copyrighted audio in git. Real-music corpus lives in git-ignored `backend/benchmark/corpus/`.
8. Python service on port 8001, Node on 8000 — never swap (see Makefile `dev-*`).
9. **Public repository — embargo rule.** For any issue titled `EMBARGOED`, committed knowledge (issues, handoffs, reports, commit messages, test names) says only `(embargoed)`; detail lives in the git-ignored `docs/agent-reports/SECURITY_REPORT.md`. Embargoed fixes stay on local branches until the product owner approves push + deploy together.

## Local environment notes (cloud session)
- Python test deps — **must be Python 3.12** (matches CI/Docker; pedalboard 0.9.25 SIGILLs on import under 3.13 here, see DECISIONS D-006):
  `uv venv -p /usr/bin/python3.12 /home/user/venv-auralith && VIRTUAL_ENV=/home/user/venv-auralith uv pip install -r backend/requirements-test.txt`
  plus `uv pip install uvicorn` for the API QA lab (`benchmark/api_qa.py` runs a real server; uvicorn is a prod dep, not in requirements-test.txt).
  (essentia/madmom/demucs are not in the test set → chord route and stems cannot run locally without the full set).
- Node/frontend: `npm ci` in `backend-node/` / `frontend/` (not preinstalled).
