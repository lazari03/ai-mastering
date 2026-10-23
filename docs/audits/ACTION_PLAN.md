# Action Plan (prioritized backlog)

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · owner: technical-lead (Agent 01) with product-specialist (Agent 14).
Canonical live state: `python3 .claude/knowledge/kb.py issues`. Effort: S ≤ ½ day · M ≤ 2 days · L > 2 days.

## Gate 0 — needs product-owner approval now
| # | Action | Owner | Effort | Benefit |
|---|---|---|---|---|
| 0.1 | Approve push + deploy of this branch (contains an embargoed fix, a critical Next.js patch and the gateway dependency fixes) | product owner → devops | S | Closes SECURITY-006/007/004 in production |
| 0.2 | Confirm whether SECURITY-001 fix (`c53034a`, in `main`) is deployed; then QA + audit and lift its embargo | product owner, qa, auditor | S | Closes the P0 |

## P1 — reliability / security (next 1–2 weeks)
| # | Issue | Action | Owner | Effort |
|---|---|---|---|---|
| 1 | DEVOPS-002 | Deploy by CI-tested SHA, post-deploy `/health` gate, one-command rollback | devops | M |
| 2 | DEVOPS-001 | Memory limits sized from SCALABILITY_REPORT peak RSS; admission reads cgroup limit | devops + backend | S |
| 3 | DEVOPS-006 | Log rotation, nightly volume snapshot + restore drill, free uptime check | devops | M |
| 4 | SECURITY-002 rest | Internal-only compose network node↔python, non-root containers (DEVOPS-004) | devops + security | M |
| 5 | BACKEND-009/010 | Polar ordering by subscription id; reconcile picks the *active* subscription | backend → payments → security → qa | M |
| 6 | QA-001 | Licensed real-music corpus + 15-pair blind listening (plan in MASTERING_QUALITY_REPORT.md) | mastering-engineer + product owner | L (external) |
| 7 | PRODUCT-001/005 | Decide Professional-tier differentiation; scope album mastering | product-specialist | decision |

## P2 — product, data, conversion
| # | Issue | Action | Owner | Effort |
|---|---|---|---|---|
| 8 | ANALYTICS-001 (H-0017) | Attribute Polar payments to the user (not session) so "Paid" stops reading 0 | backend | S |
| 9 | ANALYTICS-002 | `pricing_view`, preset events, signup step; user-level funnel | frontend + seo-analytics | M |
| 10 | BACKEND-012/013, DB-07 | Retention for `jobs`/analytics; bounded admin date ranges; Firestore TTLs | backend + database | M |
| 11 | QA-003 | Route-level `/master` tests through Express (status/code/refund assertions) | qa | M |
| 12 | SECURITY-010/011 | Limiter on `/preview-params`, admin-key failure limiter, signed analytics uid | security + backend | S |
| 13 | AUDIO-001/002/006 | Transient guardrail units; early polarity detection; loudness-target hypothesis — measurements first | audio-dsp | M |
| 14 | SEO-* | Albanian URLs (`/sq/…` + hreflang) — product decision; title lengths; self-host blog images | seo-analytics + product | M |
| 15 | FRONTEND-002 | a11y attributes | frontend | S |

## P3 — hygiene
multer 2.x migration; CSP; pin Python deps/base images; `dozzle` tag; error-code consistency for guardrail refusals (BACKEND-007);
`skills-lock.json` drift; add gitleaks + osv-scanner to CI; SessionStart hook for test env.

## Definition of done (unchanged)
Regression test fails first → fix → QA reproduces on parent + verifies → independent-auditor APPROVED → `kb.py issue-resolve`.
