# Exposure Inventory — URLs, routes, ports, paths

Audit date: 2026-10-15 · Base commit `e441297` · Branch `claude/platform-audit-2026-10` · Machine-readable: `EXPOSURE_INVENTORY.json` (151 entries).

**Scope & method.** Routes extracted from source (`backend-node/src/server.js`, `routes/*.js`, `backend/app/api/routes/*.py`, `frontend/src/app/**`), ports from `docker-compose.yml`, public hostnames from `Caddyfile`. Per-route auth/ownership/rate-limit reviewed statically by the security-engineer agent; the gateway auth-bypass list was probed locally (Express 5.2.1) for case, double-slash, encoded-slash and dot-segment variants — all fell through to `requireAuth` or 404.

**Declared ≠ reachable.** No production URL was requested. Full URLs use the hostnames configured in `Caddyfile`; their live reachability is *not verified*.

## Notable / potentially dangerous exposures

| Exposure | Where | Status | Assessment | Action |
|---|---|---|---|---|
| FastAPI `/docs`, `/redoc`, `/openapi.json` | python-service (internal) | **Modified** — disabled when `MASTERING_ENV=production` (compose sets it) | Was reachable from every container on the default compose network (not from the internet) | Also isolate python-service on its own network with node-api |
| Admin preset API `PUT/DELETE /admin/presets/:slug` | node-api, public host | Existing | Bypasses Firebase auth by design; gated by `X-Admin-Key` (constant-time compare); only general IP limiter (300/15 min) slows key guessing | Add strict limiter on admin-key failures; slug now validated |
| Admin analytics/users/notifications APIs | `/analytics/admin/*`, `/users/admin/*`, `/notifications/admin/*` | Existing | `requireAuth` + `requireAdmin` (Firestore role, anonymous rejected) | DB-03: unbounded date ranges block the event loop |
| Admin UI `/admin/**` | frontend | Existing | UI shell; no data/secrets in bundle; noindex + robots disallow | none |
| Polar webhook `POST /webhooks/polar` | node-api, public | **Modified** | Signature-verified (Standard Webhooks HMAC). (embargoed) item fixed on this branch, not deployed | see local SECURITY_REPORT |
| Newsletter `POST /newsletter/subscribe` | node-api, public | **Modified** | Was: no dedicated limiter, membership oracle, unvalidated doc-id input | Brevo double opt-in (dashboard) |
| Analytics ingest `POST /analytics/collect` | node-api, public | Existing | Trusts body `uid`; reveals admin uids via response | Signed token for uid; uniform response |
| Share links `/shared/*` | node-api, public | Existing | 256-bit tokens, IP limiter 60/5 min, job-id validation | none |
| Dozzle log viewer | host `127.0.0.1:8888` | Existing | Not internet-exposed; docker.sock mounted ro; `:latest` tag | Pin tag |
| Metrics / DB consoles / Redis / worker dashboards / file browsers | — | Not present | None found in compose, Caddy or routes | — |
| Source maps | frontend build | Verified absent | `productionBrowserSourceMaps` unset; 0 `.map` files in `.next/static` after build | — |
| Backup files / storage dirs | — | Not web-served | Volumes only reachable through ownership-checked routes | Backups missing (DEVOPS-006) |

## NEW / MODIFIED URLs AND PATHS

| Type | URL / Path | Status | Exposure | Authentication | Purpose / change |
|---|---|---|---|---|---|
| http-route | `POST /newsletter/subscribe` | modified | public | none (bypass server.js:139) | newsletterLimiter 10/15min/IP; type+length caps; uniform response |
| http-route | `GET /jobs` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | previews filtered in SQL (My Masters fix) |
| http-route | `GET /shared/link/download` | modified | public | share-token (X-Share-Token header) | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `POST /billing/checkout` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | success_url restricted to own origins |
| http-route | `PUT /custom-presets/:name` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | doc-id validation |
| http-route | `DELETE /custom-presets/:name` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | doc-id validation |
| http-route | `PUT /admin/presets/:slug` | modified | administrative | admin-key (X-Admin-Key, timingSafeEqual masteringRoutes.js:1 | doc-id validation |
| http-route | `DELETE /admin/presets/:slug` | modified | administrative | admin-key; Firebase auth bypassed | doc-id validation |
| http-route | `POST /analyze` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | error mapping via toClientError |
| http-route | `POST /master` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | error mapping (no internal text leaked; coded 503/415) |
| http-route | `POST /codec-preview` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | error mapping via toClientError |
| http-route | `GET /download-codec-preview/:jobId/:codec` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `GET /download/:jobId.:ext` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `GET /original/:jobId` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `GET /preview/:jobId` | modified | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sess | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `GET /shared/:jobId` | modified | public | share-token legacy HMAC ?token= | file-proxy upstream-unreachable error no longer leaks internals |
| http-route | `POST /webhooks/polar` | modified | public | signature (Polar/StandardWebhooks via verifyWebhook) | hardened (embargoed) |
| http-route | `POST /master` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | undecodable input → 400 invalid_audio |
| http-route | `POST /codec-preview` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | 500 detail generic + X-Error-Code |
| http-route | `GET /docs` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | disabled when MASTERING_ENV=production |
| http-route | `GET /docs/oauth2-redirect` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | disabled when MASTERING_ENV=production |
| http-route | `GET /redoc` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | disabled when MASTERING_ENV=production |
| http-route | `GET /openapi.json` | modified | internal | none (internal service; no auth by design, ARCHITECTURE.md § | disabled when MASTERING_ENV=production |
| web-page | `GET /login` | modified | public | none at page level | noindex added (SEO-agent) |
| web-asset | `GET /llms.txt` | modified | public | none | added missing pages (SEO-agent) |
| filesystem-path | ` backend-node/src/services/clientError.js` | new | internal | n/a | new source file |
| filesystem-path | ` backend-node/src/services/__tests__/clientError.test.js, listJobs.test.js` | new | internal | n/a | tests |
| filesystem-path | ` backend/tests/test_error_codes.py` | new | internal | n/a | tests |
| filesystem-path | ` docs/audits/*.md\|json (this audit)` | new | internal | n/a | reports; no secrets |
| filesystem-path | ` .claude/agents/{database-engineer,seo-analytics-engineer,growth-marketer,payments-engineer,performance-engineer,ux-designer,tooling-manager}.md` | new | internal | n/a | agent definitions |

No new public routes, ports or services were introduced. New files are source/tests/docs only and are not web-served.

## HTTP API routes

| Svc | Method | Path | Class | Auth | Ownership | Rate limit | Source | Change |
|---|---|---|---|---|---|---|---|---|
| node-api | GET | `/health` | public | none (bypass server.js:137) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:138` | existing |
| node-api | POST | `/validate-email` | public | none (bypass server.js:138) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:146` | existing |
| node-api | POST | `/newsletter/subscribe` | public | none (bypass server.js:139) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:157` | modified |
| node-api | GET | `/download-token` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | mints dl token for req.user.uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:176` | existing |
| node-api | GET | `/genres` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (static catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:180` | existing |
| node-api | GET | `/tags` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (static catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:184` | existing |
| node-api | GET | `/styles` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (static catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:188` | existing |
| node-api | GET | `/delivery-targets` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (static catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:192` | existing |
| node-api | GET | `/categories` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (static catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:196` | existing |
| node-api | POST | `/profile` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit: req.user.uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:200` | existing |
| node-api | GET | `/profile` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit: req.user.uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:209` | existing |
| node-api | GET | `/jobs` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit: listJobs(req.user.uid) jobsService.js:77 | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:218` | modified |
| node-api | GET | `/jobs/:jobId` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | getJobDetail(uid,jobId) jobsService.js:135-142 (ui | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:237` | existing |
| node-api | DELETE | `/jobs/:jobId` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:262 own | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:261` | existing |
| node-api | POST | `/jobs/:jobId/share-links` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | getJob(uid,jobId) masteringRoutes.js:295 | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:322` | existing |
| node-api | POST | `/jobs/:jobId/share` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | getJob(uid,jobId) masteringRoutes.js:295 | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:325` | existing |
| node-api | GET | `/jobs/:jobId/share-links` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:328 own | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:327` | existing |
| node-api | DELETE | `/share-links/:linkId` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | shareLinkService.js:110 revoke WHERE id=? AND uid= | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:335` | existing |
| node-api | GET | `/shared/link/info` | public | share-token (X-Share-Token header; bypass server.js:143) | token hash lookup shareLinkService.js:103; job via | shareAccessLimiter (60/5min IP) + generalLimi | `backend-node/src/routes/masteringRoutes.js:384` | existing |
| node-api | GET | `/shared/link/download` | public | share-token (X-Share-Token header) | as above; atomic consumeDownload | shareAccessLimiter (60/5min IP) + generalLimi | `backend-node/src/routes/masteringRoutes.js:399` | modified |
| node-api | DELETE | `/account` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:424` | existing |
| node-api | POST | `/account/sign-out-everywhere` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:438` | existing |
| node-api | GET | `/billing/status` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:448` | existing |
| node-api | GET | `/billing/entitlements` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:462` | existing |
| node-api | POST | `/billing/checkout` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | externalCustomerId=req.user.uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:500` | modified |
| node-api | POST | `/billing/change-plan` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:551` | existing |
| node-api | POST | `/billing/portal` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | implicit uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:569` | existing |
| node-api | GET | `/mix-presets` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | listMixPresets(uid) presetsService.js:93 | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:578` | existing |
| node-api | POST | `/import-preset` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | users/{uid}/artists (customPresetsService.js:54) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:582` | existing |
| node-api | POST | `/custom-presets` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | users/{uid}/artists | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:598` | existing |
| node-api | PUT | `/custom-presets/:name` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | users/{uid}/artists/{name} customPresetsService.js | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:606` | modified |
| node-api | DELETE | `/custom-presets/:name` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | users/{uid}/artists/{name} customPresetsService.js | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:614` | modified |
| node-api | PUT | `/admin/presets/:slug` | administrative | admin-key (X-Admin-Key, timingSafeEqual masteringRoutes.js:122-137); F | N/A (global catalog) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:626` | modified |
| node-api | DELETE | `/admin/presets/:slug` | administrative | admin-key; Firebase auth bypassed | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:635` | modified |
| node-api | POST | `/analyze` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A (no job persisted) | expensiveLimiter (20/15min, uid-or-IP; see SE | `backend-node/src/routes/masteringRoutes.js:657` | modified |
| node-api | POST | `/preview-params` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | mix_preset resolved with uid | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:685` | existing |
| node-api | POST | `/master` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | jobId server-generated masteringRoutes.js:815 | expensiveLimiter (20/15min, uid-or-IP; see SE | `backend-node/src/routes/masteringRoutes.js:731` | modified |
| node-api | POST | `/analyze-chords` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | N/A | expensiveLimiter (20/15min, uid-or-IP; see SE | `backend-node/src/routes/masteringRoutes.js:1186` | existing |
| node-api | POST | `/codec-preview` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:1224 ow | expensiveLimiter (20/15min, uid-or-IP; see SE | `backend-node/src/routes/masteringRoutes.js:1213` | modified |
| node-api | GET | `/download-codec-preview/:jobId/:codec` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:1289 ow | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:1287` | modified |
| node-api | GET | `/download/:jobId.:ext` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:1297 ow | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:1295` | modified |
| node-api | GET | `/original/:jobId` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:1313 ow | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:1312` | modified |
| node-api | GET | `/preview/:jobId` | authenticated | firebase, anon-allowed (requireAuth; anonymous Firebase sessions accep | backend-node/src/routes/masteringRoutes.js:1345 ow | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/masteringRoutes.js:1344` | modified |
| node-api | GET | `/shared/:jobId/info` | public | share-token legacy HMAC ?token= (bypass server.js:143) | verifyShareToken claim.jobId===param; getJob(claim | shareAccessLimiter (60/5min IP) + generalLimi | `backend-node/src/routes/masteringRoutes.js:1361` | existing |
| node-api | GET | `/shared/:jobId` | public | share-token legacy HMAC ?token= | as above | shareAccessLimiter (60/5min IP) + generalLimi | `backend-node/src/routes/masteringRoutes.js:1389` | modified |
| node-api | POST | `/webhooks/polar` | public | signature (Polar/StandardWebhooks via verifyWebhook) | N/A | NONE (mounted before generalLimiter, server.j | `backend-node/src/routes/webhookRoutes.js:32` | modified |
| node-api | POST | `/analytics/collect` | public | none (bypass server.js:140) | client-supplied uid trusted for attribution (analy | analyticsCollectLimiter (120/5min IP) + gener | `backend-node/src/routes/analyticsRoutes.js:81` | existing |
| node-api | GET | `/analytics/admin/live` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:121` | existing |
| node-api | GET | `/analytics/admin/behavior` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:133` | existing |
| node-api | GET | `/analytics/admin/overview` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:143` | existing |
| node-api | GET | `/analytics/admin/overview-timeseries` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:186` | existing |
| node-api | GET | `/analytics/admin/funnel` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:197` | existing |
| node-api | GET | `/analytics/admin/acquisition` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:227` | existing |
| node-api | GET | `/analytics/admin/pages` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:259` | existing |
| node-api | GET | `/analytics/admin/seo` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:290` | existing |
| node-api | GET | `/analytics/admin/sales` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:318` | existing |
| node-api | GET | `/analytics/admin/errors` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:367` | existing |
| node-api | GET | `/analytics/admin/retention` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:386` | existing |
| node-api | GET | `/analytics/admin/sessions` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:414` | existing |
| node-api | GET | `/analytics/admin/sessions/:sessionId` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:440` | existing |
| node-api | GET | `/analytics/admin/me` | administrative | firebase (non-anonymous) | N/A (global data) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/analyticsRoutes.js:453` | existing |
| node-api | GET | `/users/admin/list` | administrative | firebase (non-anonymous) | N/A (admin over any user) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminUsersRoutes.js:17` | existing |
| node-api | GET | `/users/admin/:uid` | administrative | firebase (non-anonymous) | N/A (admin over any user) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminUsersRoutes.js:27` | existing |
| node-api | POST | `/users/admin/:uid/reset-password` | administrative | firebase (non-anonymous) | N/A (admin over any user) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminUsersRoutes.js:40` | existing |
| node-api | POST | `/users/admin/:uid/resync-subscription` | administrative | firebase (non-anonymous) | N/A (admin over any user) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminUsersRoutes.js:57` | existing |
| node-api | POST | `/users/admin/:uid/disabled` | administrative | firebase (non-anonymous) | N/A (admin over any user) | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminUsersRoutes.js:70` | existing |
| node-api | GET | `/notifications/admin/list` | administrative | firebase (non-anonymous) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminNotificationsRoutes.js:13` | existing |
| node-api | GET | `/notifications/admin/unread-count` | administrative | firebase (non-anonymous) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminNotificationsRoutes.js:24` | existing |
| node-api | POST | `/notifications/admin/:id/read` | administrative | firebase (non-anonymous) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminNotificationsRoutes.js:34` | existing |
| node-api | POST | `/notifications/admin/read-all` | administrative | firebase (non-anonymous) | N/A | generalLimiter (300/15min, server.js:117; mou | `backend-node/src/routes/adminNotificationsRoutes.js:44` | existing |
| python-service | GET | `/health` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/health.py:8` | existing |
| python-service | GET | `/genres` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:78` | existing |
| python-service | GET | `/tags` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:83` | existing |
| python-service | GET | `/styles` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:88` | existing |
| python-service | GET | `/delivery-targets` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:93` | existing |
| python-service | GET | `/categories` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:98` | existing |
| python-service | GET | `/mix-presets` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:103` | existing |
| python-service | POST | `/analyze` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:121` | existing |
| python-service | POST | `/preview-params` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:131` | existing |
| python-service | POST | `/master` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:188` | modified |
| python-service | POST | `/jobs/{job_id}/cancel` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:320` | existing |
| python-service | GET | `/jobs/{job_id}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:333` | existing |
| python-service | GET | `/capacity` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:342` | existing |
| python-service | GET | `/download/{job_id}.{ext}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:347` | existing |
| python-service | GET | `/original/{job_id}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:366` | existing |
| python-service | GET | `/preview/{job_id}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:375` | existing |
| python-service | DELETE | `/files/{job_id}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:412` | existing |
| python-service | POST | `/codec-preview` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:431` | modified |
| python-service | GET | `/download-codec-preview/{job_id}/{codec}` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/mastering.py:450` | existing |
| python-service | POST | `/analyze-chords` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/api/routes/chords.py:11` | existing |
| python-service | GET | `/docs` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/main.py:15` | modified |
| python-service | GET | `/docs/oauth2-redirect` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/main.py:15` | modified |
| python-service | GET | `/redoc` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/main.py:15` | modified |
| python-service | GET | `/openapi.json` | internal | none (internal service; no auth by design, ARCHITECTURE.md §7); reacha | NONE (enforced by Node gateway) | none (governor/registry capacity only for /ma | `backend/app/main.py:15` | modified |

## Frontend pages

| Path | Class | Source | Change |
|---|---|---|---|
| `/admin/analytics/acquisition` | administrative | `frontend/src/app/admin/analytics/acquisition/page.js` | existing |
| `/admin/analytics/behavior` | administrative | `frontend/src/app/admin/analytics/behavior/page.js` | existing |
| `/admin/analytics/errors` | administrative | `frontend/src/app/admin/analytics/errors/page.js` | existing |
| `/admin/analytics/funnel` | administrative | `frontend/src/app/admin/analytics/funnel/page.js` | existing |
| `/admin/analytics/live` | administrative | `frontend/src/app/admin/analytics/live/page.js` | existing |
| `/admin/analytics` | administrative | `frontend/src/app/admin/analytics/page.js` | existing |
| `/admin/analytics/pages` | administrative | `frontend/src/app/admin/analytics/pages/page.js` | existing |
| `/admin/analytics/retention` | administrative | `frontend/src/app/admin/analytics/retention/page.js` | existing |
| `/admin/analytics/sales` | administrative | `frontend/src/app/admin/analytics/sales/page.js` | existing |
| `/admin/analytics/seo` | administrative | `frontend/src/app/admin/analytics/seo/page.js` | existing |
| `/admin/analytics/sessions/[sessionId]` | administrative | `frontend/src/app/admin/analytics/sessions/[sessionId]/page.js` | existing |
| `/admin/analytics/sessions` | administrative | `frontend/src/app/admin/analytics/sessions/page.js` | existing |
| `/admin` | administrative | `frontend/src/app/admin/page.js` | existing |
| `/admin/users/[uid]` | administrative | `frontend/src/app/admin/users/[uid]/page.js` | existing |
| `/admin/users` | administrative | `frontend/src/app/admin/users/page.js` | existing |
| `/ai-mastering-online` | public | `frontend/src/app/ai-mastering-online/page.js` | existing |
| `/app` | authenticated-ui | `frontend/src/app/app/page.js` | existing |
| `/blog/[slug]` | public | `frontend/src/app/blog/[slug]/page.js` | existing |
| `/blog` | public | `frontend/src/app/blog/page.js` | existing |
| `/bpm-finder` | public | `frontend/src/app/bpm-finder/page.js` | existing |
| `/chord-detector` | public | `frontend/src/app/chord-detector/page.js` | existing |
| `/chord-progression-finder` | public | `frontend/src/app/chord-progression-finder/page.js` | existing |
| `/login` | public | `frontend/src/app/login/page.js` | modified |
| `/lufs-meter` | public | `frontend/src/app/lufs-meter/page.js` | existing |
| `/master/[genre]` | public | `frontend/src/app/master/[genre]/page.js` | existing |
| `/mastering-loudness-targets` | public | `frontend/src/app/mastering-loudness-targets/page.js` | existing |
| `/newsletter` | public | `frontend/src/app/newsletter/page.js` | existing |
| `/` | public | `frontend/src/app/page.js` | existing |
| `/pricing` | public | `frontend/src/app/pricing/page.js` | existing |
| `/privacy` | public | `frontend/src/app/privacy/page.js` | existing |
| `/refund` | public | `frontend/src/app/refund/page.js` | existing |
| `/share` | public | `frontend/src/app/share/page.js` | existing |
| `/shared/[jobId]` | public | `frontend/src/app/shared/[jobId]/page.js` | existing |
| `/song-key-finder` | public | `frontend/src/app/song-key-finder/page.js` | existing |
| `/terms` | public | `frontend/src/app/terms/page.js` | existing |
| `/thank-you` | public | `frontend/src/app/thank-you/page.js` | existing |
| `/tools` | public | `frontend/src/app/tools/page.js` | existing |
| `/vs/[competitor]` | public | `frontend/src/app/vs/[competitor]/page.js` | existing |
| `/robots.txt` | public | `frontend/src/app/robots.js` | existing |
| `/sitemap.xml` | public | `frontend/src/app/sitemap.js` | existing |
| `/opengraph-image` | public | `frontend/src/app/opengraph-image.jsx` | existing |
| `/llms.txt` | public | `frontend/public/llms.txt` | modified |

## Services and ports

| Service | Binding | Class | Purpose | Recommendation |
|---|---|---|---|---|
| caddy | `0.0.0.0:80,443` | public | TLS termination; routes auralithforge.app→frontend:3000, api.auralithforge.app→node-api:8000 | HSTS/nosniff/frame-deny; no CSP |
| dozzle | `127.0.0.1:8888` | administrative (host-local) | container log viewer; docker.sock ro; image :latest | SSH tunnel only; pin image tag (DEVOPS-007) |
| node-api | `8000 (compose network only)` | public via Caddy | Express gateway | — |
| frontend | `3000 (compose network only)` | public via Caddy | Next.js server | — |
| python-service | `8001 (compose network only)` | internal | FastAPI DSP; no auth by design | Isolate on dedicated network with node-api only (SEC Low #7) |

## Relevant filesystem paths

| Path | Contents | Exposure | Status |
|---|---|---|---|
| `volume mastering_uploads → /app/uploads` | user uploads (personal audio) | not web-accessible directly; served via ownership-checked routes | existing |
| `volume mastering_outputs → /app/outputs` | mastered files | same | existing |
| `volume mastering_cache → /app/.cache` | model weights | not web-accessible | existing |
| `volume analytics_db / backend-node data/jobs.db (SQLite)` | jobs + first-party analytics (uids, IPs/country) | not web-accessible; no backup (DEVOPS-006) | existing |
| `docs/agent-reports/SECURITY_REPORT.md` | embargoed security detail | git-ignored (.gitignore:61); local-only | existing |
| `backend-node/src/services/clientError.js` | new source file | not web-accessible; committed | new |
| `backend-node/src/services/__tests__/clientError.test.js, listJobs.test.js` | tests | not web-accessible; committed | new |
| `backend/tests/test_error_codes.py` | tests | not web-accessible; committed | new |
| `docs/audits/*.md\|json (this audit)` | reports; no secrets | in repo (PUBLIC) — embargoed items worded neutrally | new |
| `.claude/agents/{database-engineer,seo-analytics-engineer,growth-marketer,payments-engineer,performance-engineer,ux-designer,tooling-manager}.md` | agent definitions | not web-accessible; committed | new |

## Unverified
- Live reachability of any production URL (no authorized probing performed).
- `firestore.rules` (git-ignored) — should deny all client access; the frontend does not use Firestore directly.
- Caddy's handling of client-supplied `X-Forwarded-For` ahead of `trust proxy=true` (SECURITY-004/005).
