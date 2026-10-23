# DevOps / SRE Audit

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · agent: devops role (technical-lead).
Scope: `docker-compose.yml`, Dockerfiles, `Caddyfile`, `Makefile`, `.github/workflows/*`. Prior detail: `docs/agent-reports/DEVOPS_REPORT.md`,
`docs/audits/PRODUCTION_HARDENING.md`. Method: configuration inspection only — **no access to the production host**.

## Topology (from config)
Single VPS, docker-compose: `caddy` (80/443 public) → `frontend:3000`, `node-api:8000`; `python-service:8001` internal only;
`dozzle` on `127.0.0.1:8888`. Volumes: uploads, outputs, model cache, analytics/jobs SQLite, Caddy certs.
Deploy: GitHub Actions gates (frontend build, node lint/test, python check + tests, synthetic regression) then SSH `make deploy`
(`git pull` + rebuild). See EXPOSURE_INVENTORY.md for every port.

## Re-validated issue state
| Issue | Sev | State on `e441297` |
|---|---|---|
| DEVOPS-001 | P1 | **Open** — no memory/CPU limits on any service; Python admission falls back to a host-RAM fraction |
| DEVOPS-002 | P1 | **Open** — `make deploy` = `git pull` of branch HEAD, not the CI-tested SHA; no post-deploy health gate; no rollback target |
| DEVOPS-003 | P1 | **Partly mitigated** — app refuses to boot with CORS `*` in production (`server.js`); compose still lacks `${VAR:?}` fail-fast for secrets |
| DEVOPS-004 | P2 | **Open** — all containers run as root |
| DEVOPS-005 | P2 | **Partly fixed** — frontend image now Node 22 (= CI); Python deps and base images unpinned |
| DEVOPS-006 | P2 | **Open** — no log rotation, uptime alerting or volume backups |
| DEVOPS-007 | P3 | **Open** — healthchecks only on python/node; `dozzle:latest` |

Single points of failure: the one VPS, its disk (all volumes, no backup), the single python-service (one render path), and the
SQLite files (prevent >1 node-api replica — DB-10).

## Proposed changes (need product-owner approval: production infrastructure)
1. **Memory limits** (DEVOPS-001): `mem_limit` on python-service sized from measured peak RSS (SCALABILITY_REPORT.md) and the
   admission controller pointed at the cgroup limit; modest limits on node/frontend.
2. **Deploy by SHA + health gate + rollback** (DEVOPS-002): CI passes `GITHUB_SHA`; `make deploy SHA=…` checks it out, tags images
   `:$SHA`, waits on `/health` of node + python, and re-tags the previous SHA on failure.
3. `${FIREBASE_…:?missing}` style fail-fast in compose for required secrets (DEVOPS-003).
4. Non-root `USER` in all three Dockerfiles, with volume ownership migration (DEVOPS-004) — needs a maintenance window.
5. Docker `logging: max-size/max-file`, nightly volume snapshot + restore drill, free uptime check (e.g. a GitHub Actions cron hitting `/health`) (DEVOPS-006).
6. Dedicated internal network for node-api ↔ python-service (SECURITY-002 remainder).
Kubernetes or other orchestration is **not** recommended at this scale.

## Changes made this session
`frontend/Dockerfile`: `node:20-slim` → `node:22-slim` (3 stages). No compose, Caddy, Makefile or workflow changes. Nothing deployed.
