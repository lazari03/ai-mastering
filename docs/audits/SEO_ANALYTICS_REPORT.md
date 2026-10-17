# SEO & Analytics Audit — Auralith Forge

| | |
|---|---|
| Date | 2026-10-15 |
| Commit | `e441297` (working tree; `frontend/package*.json` changes in the tree belong to a concurrent dependency upgrade and are not part of this audit) |
| Agent | seo-analytics-engineer |
| Scope | Codebase only: `frontend/` (robots, sitemap, metadata, canonicals, JSON-LD, hreflang/i18n, internal links, OG images, llms.txt, analytics client + consent) and `backend-node/` analytics ingestion/funnel queries. No live site fetched; nothing here claims anything about production state on auralithforge.app. |
| Tools | `grep`/`rg`, source reading, `next build` (16.3.8) + parsing of the prerendered HTML in `.next/server/app/*.html`, reading Next/React internals in `node_modules` to confirm root causes. |
| Extends | `SEO_ROADMAP.md`, `SEO_KEYWORD_MAP.md` (not duplicated; their P1/P2 content backlog still stands). |

Number labels: **OBSERVED** (with source), **CALCULATED** (formula), **ESTIMATE**, **MISSING**.
Traffic, impressions, rankings, CTR, conversion rates: **MISSING** — no GSC, GA4, Plausible or analytics-DB export was available.

---

## 1. Verified findings

KB IDs from `kb.py issue-add`.

### P1

**AURALITH-SEO-002: Plausible never loaded, even after consent (fixed)**
- Evidence: `frontend/src/components/Analytics.jsx:35` (before the fix) returned `<script defer data-domain=… src="https://plausible.io/js/script.js" />`. The component starts with `enabled=false` on the server and only renders the tag client-side after consent. React 19, which Next 16 vendors, creates client-rendered `<script>` elements through `innerHTML` so they never run. Only `async` + `src` scripts are hoisted and loaded. See `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:12993-13004` (warning text: "Scripts inside React components are never executed when rendering on the client") and `:25479-25483` (the hoist condition requires `props.async`).
- Impact: Plausible pageview data is structurally empty in every build (OBSERVED in code). Whether `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set in production is MISSING.
- Fix: `next/script` with `strategy="afterInteractive"`, still rendered only when `getStoredConsent()==="accepted"`. Consent gating is unchanged. Confidence: high.

**AURALITH-SEO-003: No `og:image` or `twitter:image` on any marketing page (fixed)**
- Evidence: in the baseline build, all 30 prerendered `buildMetadata` pages had no `og:image`/`twitter:image` tags (OBSERVED: parsing `.next/server/app/*.html`). The only pages that had one were the admin, 404 and `/admin` pages, because they don't call `buildMetadata`. Root cause: `frontend/src/lib/seo.js` set `openGraph.images: undefined` and `twitter.images: undefined`. Next only applies the file-based `app/opengraph-image.jsx` when the segment's `openGraph` has no own `images` key (`node_modules/next/dist/lib/metadata/resolve-metadata.js:138,149`).
- Impact: shared links to /, /pricing, /lufs-meter, the tools, the genre pages and the vs pages rendered without a preview card.
- Fix: `buildMetadata` now falls back to `/opengraph-image` (1200×630) and resolves it against `metadataBase`. Blog posts keep their own image. Verified in the rebuild: `og:image` and `twitter:image` are present on index, pricing, lufs-meter, login and blog.

**AURALITH-ANALYTICS-001: "Paid" is structurally 0 in Funnel, SEO and Acquisition dashboards (handed off to backend-engineer, H-0017)**
- Evidence: `analytics_sessions.has_paid` is written only in `backend-node/src/services/analyticsService.js:520-523`, and only when `recordServerEvent` receives a `sessionId`. Both `payment_succeeded` call sites pass only `uid`: `backend-node/src/services/polarService.js:581` and `:662`. The client `purchase` event (`ThankYouTracker.jsx`) does not set `has_paid` either (`analyticsService.js:471-475`). `getFunnel`, `getSeoOverview` and `getAcquisition` (`analyticsQueryService.js:357-379, 499-545`) count paid sessions from `s.hasPaid`. `analyticsBehaviorService.js:268` uses a `payerUids` fallback, so the dashboards disagree with each other.
- Impact: organic customers, organic revenue and visitor→paid show 0 (OBSERVED in code; DB contents MISSING). The SEO roadmap's "measure through to paid conversion" goal is not met.
- Suggested fix: attribute paid status by `uid` at query time, reusing the `payerUids` approach, or stamp the last session for the uid at webhook time. Effort: S. Test: unit test that a `payment_succeeded` event with no sessionId marks that uid's sessions as paid.

### P2

**AURALITH-ANALYTICS-002: Funnel gaps**
- `/pricing` emits no `pricing_view`. Only the homepage `#pricing` section and `PlansPanel` fire it (`app/HomeClient.jsx:39-51`, `app/ui/PlansPanel.jsx`). Sessions that visit the standalone pricing page therefore don't count as "Pricing Viewed".
- `preset_created` and `preset_updated` (`store/masteringStore.js:467`) are not in `KNOWN_EVENT_NAMES` (`lib/analyticsClient.js:39-80`) or in the backend `ALLOWED_EVENT_NAMES`, so they are silently dropped.
- The funnel steps are Visitors → Upload → Master → Pricing → Checkout → Paid (`analyticsQueryService.js:366-373`), with no Signup step. The data exists as server `sign_up` (`profileService.js:94`). The funnel is session-scoped, so a signup in one session followed by payment in a later one is not joined. A per-uid funnel (sign_up → first non-preview `master_completed` → `checkout_started` → `payment_succeeded`) can be computed from the events table, because all four carry `uid`. It is not surfaced today.

**AURALITH-SEO-001: Albanian (`sq`) cannot be indexed and hreflang is not possible**
- Evidence: language is chosen client-side from `localStorage` (`lib/i18n.js:1472-1486`). Server HTML is always English, `<html lang="en">` is hard-coded (`app/layout.js:78`) and nothing updates `documentElement.lang`. No `/sq` URLs exist.
- Impact: sq copy is invisible to search engines. Adding hreflang now would be wrong, because there are no alternate URLs to point at. The fixed `lang` attribute is also a small accessibility issue for sq users.
- Decision for product-specialist: either keep sq as a UI preference only (no SEO value) or add locale-prefixed routes (`/sq/...`). The second option needs translated metadata and `alternates.languages`.

### P3

- **AURALITH-SEO-004: `/login` was indexable (fixed).** It had `index,follow` plus a canonical but was excluded from the sitemap. It is now `noindex` and still crawlable (not disallowed in robots), so the noindex can be read.
- **The robots disallow `/app` is a prefix match.** It also blocks any future top-level path starting with `/app` (for example `/apple-music-loudness`). Nothing affected exists today (OBSERVED: route list). Consider `"/app$"` plus `"/app/"` if such a page is ever planned. Same reasoning for `/share` and `/admin`.
- **`/shared/[jobId]` canonical points to `/shared`, which is a 404 route** (`app/shared/[jobId]/page.js:7`). Harmless because the page is noindex and disallowed. Cosmetic.
- **llms.txt was missing `/pricing`, `/tools` and `/lufs-meter`** from "Key pages" (fixed). Its pricing table (`public/llms.txt:199-203`) omits the Indie plan (€4.99, 15 masters; `lib/pricing.js:27-30`) and annual prices. Not edited, because pricing copy needs product-specialist review. The new Pricing link says the page is authoritative.
- **Blog OG images are hot-linked from images.pexels.com** (`content/posts.js:26,54,82`). This is a third-party availability dependency for social cards.
- **FAQPage JSON-LD on commercial pages** (home, tools, genre, vs, loudness). Google has limited FAQ rich results to authoritative government and health sites since 2023, so expect no rich snippet. The markup is valid and harmless.
- **Comment drift.** `Analytics.jsx` said Plausible was the only provider, but TelemetryDeck is also sent (`lib/telemetryDeck.js`). Comment updated. `seo.js` `organizationJsonLd` says "3 plans", but `PLAN_ORDER` has 4. The output is computed and correct.

### Verified OK (no action)

- **robots.txt.** Disallows `/app`, `/thank-you`, `/share` (which also covers `/shared/`) and `/admin` for Googlebot, Bingbot, named AI crawlers and `*`, and points to the sitemap (OBSERVED: `app/robots.js:36,66-81`; built `robots.txt`).
- **noindex.** `/app`, `/thank-you`, `/share`, `/shared/[jobId]` and `/newsletter` are noindex. `admin/analytics/layout.js` and `admin/users/layout.js` are `noindex,nofollow,noarchive`. `/admin` itself is a server redirect.
- **sitemap.** It covers every indexable route (CALCULATED: 11 static + 3 posts + 8 genres + 2 vs + 3 tool landings = 27). This matches the 27 indexable `index,follow` pages in the build (OBSERVED). The build also emits `admin.html` as `index,follow`, but `/admin` is a server redirect to the noindexed dashboard and is disallowed in robots.
- **Unknown slugs.** For `/blog`, `/master` and `/vs`, unknown slugs call `notFound()`.
- **Canonicals.** Present and self-referencing on every indexable page.
- **Titles and descriptions.** Unique across all indexable pages. The only duplicate titles are the admin pages ("Analytics"), and the only duplicate description is the root default used by admin/404 (OBSERVED: build HTML parse). Title lengths run 30–94 chars. 4 indexable titles are over 75 chars (index 85, blog posts 85 and 94, lufs-meter 81), so they will likely be truncated in SERPs (ESTIMATE).
- **Internal links.** All literal and templated `href`s (`/master/${GENRE_KEYS}`, `/vs/…`, `/blog/${POSTS.slug}`, `lib/internalLinks.js`) resolve to existing routes. No broken internal links were found (OBSERVED: static grep, 40+ distinct targets).
- **JSON-LD.** WebSite, Organization and SoftwareApplication (EUR AggregateOffer from `lib/pricing.js`) on home. Article on blog posts. BreadcrumbList via `<Breadcrumbs>`. SoftwareApplication on the tools. Service on genre pages.
- **Consent.** Behavior matches `app/privacy/page.js:144-149`. First-party events are always sent, but with in-memory ids until the visitor accepts. TelemetryDeck and Plausible load only after Accept. `sanitizePath` strips token, code and similar query keys. `/admin` traffic is excluded.

## 2. Unverified concerns
- Whether `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `NEXT_PUBLIC_TELEMETRYDECK_APP_ID` are set in the production build: MISSING.
- `www.auralithforge.app` has no Caddy block (`Caddyfile:35,59`). Whether DNS for www exists or redirects is unknown, and duplicate-host risk is unverified.
- No CSP exists today. If one is added later, it must allow `plausible.io`.
- Actual index coverage, sq demand and organic conversion are MISSING (no GSC or DB access).

## 3. Changes made (uncommitted)
| File | Change |
|---|---|
| `frontend/src/components/Analytics.jsx` | Plausible tag now uses `next/script` (afterInteractive), still consent-gated. Comment corrected. |
| `frontend/src/lib/seo.js` | `DEFAULT_OG_IMAGE` fallback for `openGraph.images` / `twitter.images` in `buildMetadata`. |
| `frontend/src/app/login/page.js` | `noindex: true`. |
| `frontend/src/app/sitemap.js` | Comment only (documents the /login and /newsletter exclusions). |
| `frontend/public/llms.txt` | Added Pricing, Free tools and LUFS meter to "Key pages". |
| `.claude/knowledge/KNOWN_ISSUES.json`, `AGENT_HANDOFFS.json` | Added AURALITH-SEO-001..004, AURALITH-ANALYTICS-001..002 and handoff H-0017. |

No user-visible UI strings changed, so no i18n keys were needed.

## 4. Tests and results
- `next build` (with `NEXT_PUBLIC_SITE_URL=https://auralithforge.app` and `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` set) **passed**. 50 static pages were generated and there were no warnings.
- The build ran **twice**: once as the baseline for the HTML metadata parse, which is how SEO-003 was found, and once after all edits to verify them. Both passed.
- Verified in the rebuild:
  - `og:image` and `twitter:image` are present on the sampled pages.
  - `/login` is `noindex, nofollow`.
  - robots.txt output is unchanged.
  - the `plausible` reference is present in the client chunks.
- **Not run:** a browser check that Plausible actually fires after Accept. That needs a running app and the network.

## 5. Recommendations (priority order)
1. Backend: fix `has_paid` attribution (H-0017) before using any organic-revenue numbers.
2. Add a uid-level funnel (signup → first master → checkout → paid) to `/admin/analytics/funnel`. Fire `pricing_view` on `/pricing`, or have the backend set `has_viewed_pricing` on a `/pricing` page_view. Allowlist or rename the preset events.
3. Product decision on sq: UI-only, or `/sq` routes with hreflang.
4. Trim the 4 titles over 75 chars, and self-host the blog OG images.
5. Sync the llms.txt pricing table with `lib/pricing.js` (needs product-specialist review).
6. Continue the `SEO_ROADMAP.md` P1 content backlog unchanged.

## 6. Remaining risks
- `next/script` loads Plausible once per page lifetime. Revoking consent mid-session does not unload it until the next full navigation. This is the same as the old intent, and there is no consent-revoke UI today.
- The package upgrade running in the same tree may change Next/React behavior. Both builds above ran against the tree as it was at audit time.
