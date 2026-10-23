# QA Report

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · environment: cloud container (4 vCPU, 16 GB, Python 3.12.3, Node 22.22.0) — **not production**.
Prior QA evidence (API audio lab, 33 cases): `docs/agent-reports/QA_REPORT.md`, `test-results/auralith-qa.json` — not re-run (no DSP code changed; hash rule in TEST_BASELINES.json).

## Results
| Suite | Command | Before (e441297) | After (branch) |
|---|---|---|---|
| Python | `cd backend && python -m pytest -q` | 271 passed | **274 passed** (+3 `test_error_codes.py`), 0 failed |
| Node lint | `cd backend-node && npm run lint` | clean | clean |
| Node tests | `cd backend-node && npm test` | 68/68 | **72/72** (+3 `clientError.test.js`, +1 `listJobs.test.js`) |
| Frontend build | `NEXT_PUBLIC_SITE_URL=https://auralithforge.app npm run build` | pass | pass (56 routes) |
| Frontend test | `node --test tests/localized-imports.test.mjs` | 1/1 | 1/1 |
| npm audit (gateway) | `npm audit` | 3 (1 critical) | **0** |
| npm audit (frontend, prod) | `npm audit --omit=dev` | 7 (1 critical, 6 high) | 4 high, all `@grpc/grpc-js` via firebase (no upstream fix; accepted risk) |
| pip-audit (installed test env) | `pip-audit` | — | no known vulnerabilities (prod `requirements.txt` unpinned → cannot be audited as-is, DEVOPS-005) |
| bandit | `bandit -r app -ll` | — | 0 medium/high |

## Regression proof for each fix
Each new test was run against the parent-commit version of the changed file and **failed**, then passed on the fix:
`clientError.test.js` #3 (unreachable upstream), `listJobs.test.js`, `test_error_codes.py` (decode, output_format, docs-disabled).

## Not tested (and why)
- Browser E2E / customer journey — needs a Firebase test project.
- Billing against Polar sandbox / Firestore emulator — not available; payments review used fakes + throwaway tests.
- Live production URLs — not authorized/probed.
- Listening quality — PENDING (QA-001).
- Plausible firing after consent — verified by build + reading only.
- Synthetic DSP regression — not re-run; no DSP files changed (CI runs it on push).

## Note on test runner
`node --test tests/` (directory form) reports a spurious failure on Node 22; pass the file path explicitly as above.
