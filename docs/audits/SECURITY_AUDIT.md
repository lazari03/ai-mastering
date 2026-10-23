# Security Audit

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · agents: security-engineer (route review),
payments-engineer (billing abuse), technical-lead (dependencies, fixes).
Scope: all 70 gateway routes + 24 Python routes, auth bypass list, admin surfaces, uploads/errors, dependencies, infra exposure.
Tools: static review, local Express probe of the auth gate, `npm audit`, `pip-audit` (installed test env), `bandit -ll` (backend/app),
throwaway node tests (scratchpad, not committed). Not available: gitleaks, semgrep, trivy, osv-scanner, Firestore rules, live environment.

**Public repository — embargo rule applies.** Unfixed/undeployed High/Critical items are listed only as "(embargoed)".
Detail lives in the git-ignored `docs/agent-reports/SECURITY_REPORT.md` on the auditor's machine.

## Verified findings this session
| ID | Sev | Finding | Status |
|---|---|---|---|
| AURALITH-SECURITY-007 | P1 | `next@16.3.5` in range of public advisories incl. critical RCE in `next/og` `ImageResponse` (used: `app/opengraph-image.jsx`), image-optimizer SSRF (`images.remotePatterns` configured), cache-poisoning | **Fixed**: `next@16.3.8` (patch); build passes; `sharp` 0.35.5, `source-map-js` 1.2.2 via lock refresh |
| AURALITH-SECURITY-006 | P1 | (embargoed) gateway, node.gateway | **Fixed on branch**, not deployed |
| AURALITH-SECURITY-004 | P2 | Gateway deps: proxy-addr (critical, IP spoofing via IPv4-mapped IPv6), ip-address, @fastify/busboy | **Fixed**: `npm audit` → 0 vulnerabilities. multer 1.x / `trust proxy=true` remain |
| AURALITH-SECURITY-008 | P2 | `/newsletter/subscribe`: general limiter only, membership oracle, unvalidated email/source as Firestore doc id | **Fixed**: 10/15 min IP limiter, string+length checks, `/` rejected, uniform response. Brevo double opt-in is a dashboard setting — unverified |
| AURALITH-SECURITY-009 | P3 | Unvalidated checkout `success_url`; preset `:name`/`:slug` as doc ids; internals in file-proxy & codec-preview errors; FastAPI docs on in prod | **Fixed** (own-origin allowlist, doc-id guard, generic messages, docs off when `MASTERING_ENV=production`) |
| AURALITH-SECURITY-010 | P3 | `/preview-params` unthrottled + 5 MB JSON; general limiter IP-keyed (comment says uid); no strict limiter on admin-key failures | Open |
| AURALITH-SECURITY-011 | P3 | `/analytics/collect` trusts body uid; admin uid enumeration | Open |
| AURALITH-BACKEND-002/003/006/008 | P2–P3 | Raw Python/internal error text to browsers; 500 for bad file type; ffmpeg stderr in 500 | **Fixed** (see BACKEND_AUDIT.md) |

Residual dependency advisory: `@grpc/grpc-js` ≤1.13.5 (high, `getAuthContext` cert check) pulled by `firebase` client SDK. No fixed
upstream (even `firebase@13.0.0` pins `~1.9`); the vulnerable server-side TLS path isn't used by the browser Firestore client
(the frontend doesn't use Firestore directly). **Accepted risk**, re-check on each firebase release.

## Verified sound (no action)
- Auth bypass list (`server.js`): case, `//`, `%2f`, dot-segment variants all reach `requireAuth` or 404; `/admin/` bypass reaches only admin-key routes.
- Admin data APIs: `requireAuth` → `requireAdmin` (Firestore role, anonymous rejected). Admin key compared in constant time.
- Job-id / path-param validation (c53034a), `safeJoin`, upstream URL encoding, Python `ids.py` fullmatch.
- Entitlements: no bypass of Professional engine, stems, previews, anonymous limits or refund-on-failure (payments review).
- No source maps served; Python port not published; Dozzle bound to 127.0.0.1. Bandit: no medium/high in `backend/app`.

## Earlier embargoed items
SECURITY-001 (P0) fix commit `c53034a` is in `main` history (merged via PR #8). **Whether it is deployed is unverified** — the
product owner must confirm, then QA + audit close it and the embargo can lift. SECURITY-002 (P1) remainder (service auth /
network isolation / non-root) still open; this session added one piece (FastAPI docs off in production) and recommends a
dedicated compose network for node-api ↔ python-service.

## Recommendations (ordered)
1. Deploy this branch's fixes (needs approval), then confirm SECURITY-001 deployment and lift its embargo.
2. TTL on `webhookFailures` and other log collections (DB-07).
3. SECURITY-010/011; dedicated internal network; non-root containers (DEVOPS-004); CSP (Caddyfile notes).
4. Add free CI scanners: gitleaks (public repo) + osv-scanner; keep `npm audit --omit=dev` gate.

## Remaining risks
Firestore rules unauditable from repo; Caddy `X-Forwarded-For` handling untested live; no secret scan of full git history (gitleaks unavailable).
