# DevOps Report (Step 1 discovery audit, read-only)

Docker CLI present; `docker compose config -q` exit 0 (only "variable not set" warnings for unset secrets). Image builds and runtime checks not executed: BLOCKED.

| Check | Result | Evidence |
|---|---|---|
| compose file valid | PASS | `docker compose config -q` rc=0 |
| python-service memory limit (cgroup read by admission) | FAIL | docker-compose.yml:3-30 has no `mem_limit`/`deploy.resources`/`MASTERING_MEMORY_BUDGET_MB`; falls back to host fraction (job_runner.py:77-87) |
| CPU limits / OOM isolation among services | FAIL | docker-compose.yml: none on any service |
| Restart policies | PASS | `unless-stopped` on all 5 services |
| Healthchecks python/node | PASS | docker-compose.yml:21-26, 114-119 |
| Healthcheck frontend/caddy/dozzle | FAIL | docker-compose.yml:122-141, 143-155 none; frontend `depends_on` is not health-gated |
| Python 8001 not public | PASS | no `ports:` on python-service (docker-compose.yml:28-30); Caddyfile routes only frontend:3000, node-api:8000 |
| Dozzle exposure | PARTIAL | bound 127.0.0.1:8888 (docker-compose.yml:152) but mounts docker.sock and uses `:latest` (docker-compose.yml:147-150) |
| Volumes persist uploads/outputs/cache/db/certs | PASS | docker-compose.yml:15-18,41,157-163 |
| Pinned base images | FAIL | `python:3.12-slim`, `node:22-slim`, `node:20-slim`, `caddy:2-alpine`, `dozzle:latest`: tags only, no digests |
| Python deps pinned | FAIL | backend/requirements.txt: 0 pinned lines (`==`); only requirements-test.txt is pinned; madmom/cython unpinned (Dockerfile:24-26) |
| Node version consistency | FAIL | frontend/Dockerfile uses node:20; CI frontend-check builds on Node 22 (deploy.yml:36) |
| Python 3.12 match CI/Docker | PASS | backend/Dockerfile:1, deploy.yml:100 |
| Non-root user | FAIL | no `USER` in any Dockerfile (backend:47, node:31, frontend:48); python runs as root with write to volumes |
| Layer hygiene / .dockerignore | PASS | all three services have .dockerignore; apt lists removed; deps layer before COPY. Minor: build-essential/git kept in runtime image (backend/Dockerfile:7-12) |
| Caddy routing | PASS | Caddyfile:35-62 |
| Caddy security headers | PARTIAL | HSTS, nosniff, XFO, Referrer, Permissions-Policy present (Caddyfile:19-26); no CSP (Caddyfile:27-30) |
| Production CORS config | FAIL | `CORS_ORIGINS: ${FRONTEND_ORIGIN:-*}` (docker-compose.yml:~75); settings.js:28 default `*`; compose comment admits wildcard ships |
| Required secrets without fail-fast | FAIL | compose uses `${VAR}` with no `:?`; unset ADMIN_API_KEY/DOWNLOAD_TOKEN_SECRET/POLAR_* give blank strings (compose warnings) |
| Deploy gated on all test jobs | PASS | deploy.yml:181 needs frontend-check, node-check, python-check, python-tests, synthetic-regression; main-only deploy.yml:188 |
| CI runs real tests | PASS | pytest deploy.yml:147, node `npm test` :86, synthetic regression :171, frontend build :52-54 |
| Rollback path | FAIL | Makefile:59-82 `deploy` = git pull + rebuild in place; no image tagging, no previous-version retention, no post-deploy health verification, no `rollback` target; failed deploy leaves partial state |
| Post-deploy health verification | FAIL | deploy.yml:198-222 ends at `make deploy`; no smoke test/curl |
| Deploy uses unpinned `git pull` on main | WARN | Makefile:60 pulls HEAD of branch, not the CI-tested SHA (race if another push lands) |
| release-benchmark workflow | PASS (BLOCKED to run) | manual dispatch, self-hosted label, fails closed on missing corpus/baseline (release-benchmark.yml:263-274); not wired as deploy gate; needs self-hosted runner with licensed corpus (AURALITH-QA-001) |
| Secrets in workflows | PASS | only `secrets.DEPLOY_*` (deploy.yml:194-199); inputs interpolated into shell in release-benchmark.yml:265-284 (dispatch-only, low risk). appleboy/ssh-action pinned to tag, not SHA |
| Storage cleanup / retention | PARTIAL | python sweep of uploads+outputs by age (storage_cleanup.py:43-47, 48h default); no disk-usage cap; mastering_cache and analytics_db unbounded; `docker image/builder prune` in deploy (Makefile:71-72) |
| Logging | FAIL | no `logging:` driver/max-size on any service; default json-file unbounded growth; dozzle is viewer only, no persistence/alerting |
| Monitoring / alerting | FAIL | no uptime monitor, metrics, or alerting; only healthchecks + Telegram business alerts |
| Backups of volumes (analytics_db, caddy_data) | FAIL | none present |
| Concurrent processing / cancel behaviour at runtime | BLOCKED | needs running stack; admission code exists (mastering.py:42, job_runner.py) |
| Image build reproducibility (actual build) | BLOCKED | not built in this audit |

Related KB: AURALITH-BACKEND-001 (concurrency cap counts jobs, not memory) remains NEEDS_REVERIFICATION; the missing compose memory limit is a prerequisite for closing it.
