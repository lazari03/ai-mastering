# Engineering decisions (Level 2)

Append-only. Format: ID · date · decision · rationale · alternatives · components · commits/sources.
Before re-opening a decision, cite new evidence. Owner: technical-lead; auditor verifies.

## D-001 · 2026-10-10 · File-based shared knowledge, not Graphify
- **Decision:** Shared knowledge lives in `.claude/knowledge/` (Markdown + JSON) with a stdlib-only CLI `kb.py` for focused queries, staleness and handoffs.
- **Rationale:** Graphify is not installed (`pip show graphify` → not found; only a stale `graphify-out/` gitignore line). Installing it adds a dependency, an index to maintain, and possibly embedding costs, for a ~25k-line repo whose component graph fits in one JSON file (`COMPONENTS.json`). No measurement exists showing it would cut context use.
- **Alternatives:** Graphify semantic index (rejected for now; revisit if the knowledge base outgrows grep + kb.py, measured by retrieval misses in handoffs); per-agent `memory:` frontmatter (rejected: creates private copies, which the single-source-of-truth rule forbids).
- **Components:** all · **Source:** this session.

## D-002 · 2026-10-10 · Agents are versioned; .gitignore narrowed
- **Decision:** `.claude/agents|knowledge|workflows` and `docs/agent-reports/*.md` are tracked; the rest of `.claude/` stays ignored.
- **Rationale:** `.gitignore` ignored `.claude/` and `*.md`, so the organization would silently never persist across clones.

## D-003 · 2026-10-10 · API-level QA lab reuses the benchmark package
- **Decision:** The QA harness (`backend/benchmark/api_qa.py`, `qa_corpus.py`) submits audio over HTTP to the real FastAPI `/master` route (same `run_in_worker` path customers hit through Node) and measures with `benchmark.metrics.compare` + pyloudnorm. Synthetic fixtures come from `tests/synthetic.make_mix`.
- **Rationale:** Reuse existing calibrated fixtures and loudness-matched metrics; avoid a second framework. The spec's `tests/audio_corpus/` layout is mapped onto `backend/benchmark/` (existing home of corpora).
- **Limitation:** Node gateway (auth, billing) is not in the loop locally (needs Firebase credentials); app mounts `mastering_router` directly because `app.main` imports essentia via the chords router.

## D-004 · 2026-10-10 · No numeric thresholds invented for QA
- **Decision:** QA pass/fail uses only existing limits (`GuardrailConfig`, `benchmark.metrics`, QC fail lines, regression TOLERANCES). Anything else is reported as a measurement, not a verdict.

## D-005 · 2026-10-10 · Native agent registration requires a session restart
- **Decision:** In the session that created `.claude/agents/`, specialist work runs via general-purpose subagents instructed to load the agent definition file verbatim. Native `subagent_type` use starts next session.
- **Rationale:** Claude Code watches only agent directories that existed at session start (docs: code.claude.com/docs/en/sub-agents).

## D-006 · 2026-10-10 · Local Python must be 3.12
- **Decision:** Use a Python 3.12 venv locally (matches CI and `backend/Dockerfile`).
- **Rationale:** `pedalboard==0.9.25` raises SIGILL on import under Python 3.13 in this container (exit 132 for the whole pytest run). Under 3.12: 229 passed, synthetic drift 0.

## D-007 · 2026-10-22 · Meta Pixel + Conversions API re-added for a paid-ads test
- **Decision:** Meta was removed earlier with GA/TikTok; it comes back (Pixel + CAPI only — GA and TikTok stay removed) to run a paid-ads test. Mapping: page views → `PageView` (Pixel only); `pricing_view` → `ViewContent`, `signup_completed` → `CompleteRegistration`, first real master → custom `FirstMasterCompleted`, `begin_checkout` → `InitiateCheckout` (Pixel + CAPI, one shared `event_id` for dedup); Polar `order.paid` / `subscription.created` → `Purchase` (**CAPI only**).
- **Consent gating (GDPR, EU is the main market):** nothing from Meta loads, no `_fbc` is written and no CAPI call is made unless `cookie_consent === "accepted"`. Browser: `MetaPixel.jsx` / `lib/metaPixel.js` re-check consent on every call; Decline revokes and clears `_fbp`/`_fbc`. Server: `/analytics/collect` forwards only when the batch carries `meta.consent === "accepted"`; Purchase only when the consent stored at checkout (`users/{uid}.metaAttribution`) was accepted. A pre-consent `fbclid` is kept in memory only.
- **Single path:** all funnel events go through `trackEvent()` → Pixel + `/analytics/collect` → `metaConversionsService.forwardCollectEventsToMeta` (server-side allowlist is the real boundary). No `fbq` calls in components.
- **Server-only Purchase:** real amount/currency from Polar (cents → units), survives ad blockers and closed tabs; `ThankYouTracker` never sends a browser Purchase, so nothing double-counts. `event_id = purchase_<polar id>`; order retries are stopped by `processedPolarOrders`, subscription replays by a `metaPurchases/{eventId}` marker.
- **First master decided server-side:** `/master` claims `users/{uid}.firstMasterAt/firstMasterJobId` in a transaction and returns `first_master: true` once. Users who mastered before the field existed (real jobs on record, or Free counter > 1) are recorded as not qualified, so they never fire it. CAPI re-verifies the job id before sending.
- **Failure isolation:** CAPI is fire-and-forget (3 s timeout, all errors logged and swallowed, never awaited by webhooks/collect); no-op when `META_PIXEL_ID`/`META_CAPI_TOKEN` are unset. Email/uid are SHA-256 hashed (email trimmed + lowercased); IP/UA/fbp/fbc unhashed per Meta spec. Graph API version is a constant (`v26.0`).
- **Alternatives:** browser-only Pixel (rejected: ad blockers, no real purchase amount); a localStorage "first master" flag (rejected: wrong across devices, spoofable).
- **Components:** frontend `MetaPixel.jsx`, `lib/metaPixel.js`, `lib/analytics.js`, `lib/analyticsClient.js`; backend-node `metaCapiService.js`, `metaConversionsService.js`, `polarService.js`, `analyticsRoutes.js`, `masteringRoutes.js`. **Setup:** `docs/META_ADS_SETUP.md`.

## D-008 · 2026-10-23 · Purchase is counted at Meta even without consent — anonymously
- **Decision:** Refines D-007. Every paid Polar order/subscription sends a CAPI `Purchase`. With stored consent "accepted": attributed, as before. Otherwise: **anonymous** — product, value, currency, `action_source: "other"`, a random `event_id` (`anon_<uuid>`), and `user_data.external_id` = SHA-256 of a random UUID generated per event and never stored. No IP, user agent, `_fbp`/`_fbc`, email, uid, order id or page URL.
- **Rationale:** Revenue in Ads Manager should match real sales. Meta rejects events without a customer-information field, so one is needed; a never-stored random value can't be linked to the buyer by Meta or by us, so the payload is not personal data under GDPR, and nothing touches the visitor's device (no ePrivacy consent needed). Consequence: Meta can't attribute these sales to a campaign — they raise the Purchase count/value only. The `metaPurchases` marker for anonymous sales stores no uid.
- **Alternatives:** no Meta event without consent (D-007 — rejected by product owner: sales undercounted); hashed order id or uid as `external_id` (rejected: pseudonymous, we could re-identify → still personal data).
- **Components:** `backend-node/src/services/metaConversionsService.js` (`sendPurchaseToMeta`), `metaCapiService.js` (`anonymousId`); privacy policy §§ processors and 7.
