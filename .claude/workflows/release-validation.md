# Release validation

Owner: technical-lead (coordinates) · independent-auditor (verdict). Nothing here pushes or deploys.

## Change-scoped gates (every meaningful change)
| Changed paths | Required checks |
|---|---|
| `backend/ai_mastering/**`, `params.py`, presets, `adaptive_mastering.py` | pytest · synthetic regression (0 unexplained drift) · `python -m benchmark.api_qa` · real corpus if present · listening comparison prepared |
| `backend/app/**` | pytest · `benchmark.api_qa --quick` |
| `backend-node/src/**` | `npm run lint` · `npm test` (billing: concurrency + refund suites must pass) |
| `frontend/src/**` | `npm run build` · e2e workflow (when the browser harness exists) · i18n check (en + sq) |
| infra files | compose config validation · build · health checks |
| UI/copy-only | **no** audio corpus run |

## Release candidate checklist
1. Full Python suite, Node suite, frontend build — all green, results recorded in `TEST_BASELINES.json`.
2. Synthetic regression drift = 0 or every drift explained in DECISIONS + baseline rewritten in the same commit.
3. API QA lab: all renders succeed for valid inputs; invalid inputs refused with a clear 4xx; no guardrail failures beyond the known list.
4. Billing: ledger invariants (BILLING_RULES.md) intact; no credit consumed on failed jobs (tests).
5. Security review of the diff (security-engineer); no secrets in reports.
6. DevOps: build reproducible, resource limits set, rollback = previous image/commit.
7. Open P0s listed in MASTER_STATUS.md. **Any open P0 blocks release.**
8. Audio quality: objective status + listening status reported separately; listening stays PENDING without human evidence.
9. Independent auditor issues APPROVED / REJECTED with evidence in INDEPENDENT_AUDIT.md.
10. Product owner approves push/deploy.

## Scores
Scores in MASTER_STATUS.md must cite evidence (test ids, reports). Unverified areas are capped at the level of evidence available, not at agent confidence.
