# Navigation and broken-link audit

Date: 2026-10-17. Branch `nav-fix` (base `b5c0a84`).

## Method

1. Static inventory of every navigation source in `frontend/src` and `frontend/public`: header (desktop bar, Studio panel, mobile menu), footer, `/app` tab keys, admin tab strip, tool pages, blog index and posts (`src/content`), `/master/[genre]`, `/vs/[competitor]`, CTAs, `Link href`, `<a href>`, `router.push/replace`, `redirect()`, hash anchors, mailto, external links, `llms.txt`, `sitemap.js`. Each internal target was mapped to `src/app/**/page.js` routes, with dynamic params checked against the real slug lists (`GENRE_KEYS`, `COMPARISON_KEYS`, `POSTS`, `TOOL_LANDING_KEYS`).
2. Runtime crawl (Playwright, Chromium) of the baseline build and the fixed build. Seeds: `/`, `/login`, `/newsletter`, `/share`, `/app`, `/thank-you`, `/shared/abc` and every sitemap URL. All same-origin links were followed at 1440px and 390px, with the Studio dropdown (desktop) and the full-screen menu (mobile) opened on every page. Every hash target was checked for an existing id. Any 404/500, not-found or error-boundary body, or missing anchor was recorded. `/admin/*` is auth-gated and covered by the static test only. The backend was not running; API errors were ignored.
3. Guard: `frontend/tests/internal-links.test.mjs` (`node --test`).

## Results

| | Pages crawled (desktop / mobile) | Broken links |
|---|---|---|
| Before | 33 / 33 | 1 distinct (2 crawl hits: desktop + mobile) |
| After | 33 / 33 | 0 |

No internal link in the baseline pointed at a missing route: every `/master/*`, `/vs/*`, `/blog/*`, tool, legal and admin href resolved, and `llms.txt` and the sitemap are clean. The one real defect was a dead skip-link anchor.

| Source | Bad target | Fix |
|---|---|---|
| `frontend/src/components/marketing/SiteHeader.jsx` (skip link, on every page) with `frontend/src/app/HomeClient.jsx:127` (target) | `#main` on `/` had no element with `id="main"`, so "Skip to content" did nothing on the homepage | Added `id="main"` to the homepage `<main>` |

Other defects fixed (not 404s, but needed for one consistent pattern):

| Source | Problem | Fix |
|---|---|---|
| `SiteHeader.jsx` NAV_LINKS | Plain `<a>` (full page reload) for primary links while tools used `Link`; mobile chips had no `aria-current`; skip link and nav aria-labels hardcoded English | `Link` everywhere, `aria-current="page"` desktop and mobile, strings via i18n |
| `SiteHeader.jsx` mobile menu | No `aria-controls`, no focus handling | Focus moves to first link on open, returns to toggle on Escape, menu `inert` when closed |
| `Footer.jsx` | Hardcoded href lists; no `/newsletter` link; "X mastering" and "Auralith vs X" labels English-only | Renders from `lib/navigation.js`; Newsletter link added; labels via i18n (en + sq); `aria-current` |
| `AdminShell.jsx` | Own hardcoded nav list, no `aria-current` | Uses `ADMIN_NAV`; `aria-current` |
| `app/not-found.js` | Existed but English-only | Localized via `components/site/NotFoundContent.jsx` (home, tools, pricing, popular tools, guides) |

## Navigation pattern

`frontend/src/lib/navigation.js` is the single source of truth: `PRIMARY_NAV`, `PRODUCT_NAV`, `PUBLIC_TOOLS` and `STUDIO_GROUPS` (from `lib/studio.js`), `GENRE_NAV`, `COMPARE_NAV`, `RESOURCES_NAV`, `LEGAL_NAV`, `ADMIN_NAV`, `NOT_FOUND_LINKS`, and the shared `isActiveHref()`. Labels are i18n keys in `lib/i18n.js` (en + sq). Header, mobile menu and footer render from it. The `/app` tab keys stay in `AppClient.jsx`; the guard validates `?tab=` deep links against them.

## Expected pages that do not exist (not created)

`/about` and `/contact`. Contact is the `/#contact` section of the homepage (mailto studio@auralithforge.app), which is what nav and footer link to.

## Review round (follow-up commit)

An independent review of the first commit required these changes; all are done.

| Item | Change |
|---|---|
| Mobile menu `inert` | `inert={!menuOpen}` (React 19 ignores `""`). Verified in Chromium: closed menu has `inert` and 0 tabbable controls. Focus is trapped while open (60 Tabs never left it; Shift+Tab stays inside). |
| `/tools` in desktop bar | Removed from `PRIMARY_NAV` (sq "Të gjitha mjetet" wrapped to 3 lines at 1024px, header 62 to 93px). It stays in the Studio panel ("All tools") and leads the mobile chip row (`TOOLS_HUB`). Header measured 62px at 1024 and 1280px in en and sq. |
| Guard test | Anchors are looked up only in the target page's own import graph (removing `id="faq"` from the homepage now fails). `CTA.*`, `planSignupHref()` output, `href={CONST}` and link-table literals in `lib/*` are resolved. `?redirect=`/`?next=` targets are validated. Dead block removed. Each case was proven by temporarily breaking a link. |
| Single sign-in/up source | `SIGNUP_URL` (studio.js) is re-exported as `SIGNUP`; `CTA` in `lib/internalLinks.js` reads `SIGNIN`/`SIGNUP`/`PRICING`/`BLOG` from `lib/navigation.js`. |
| Lost destination | Signed-out `/app?...` and the admin gate go to `/login?redirect=<current path>` (`loginWithRedirect`). Verified `/app?tab=plans` lands on `/login?redirect=%2Fapp%3Ftab%3Dplans`. |
| Open redirect | `LoginClient` uses `safeInternalPath` (rejects `//`, backslash, schemes, control characters). |
| `/shared/[jobId]` canonical | `generateMetadata` uses `/shared/<jobId>` (noindex kept). |
| Share URL origin | `settings.frontendOrigin` is `firstOrigin(FRONTEND_ORIGIN)` (first trimmed entry of a comma-separated list). Test: `backend-node/src/config/__tests__/firstOrigin.test.js`. |
| Cleanup | Unused i18n keys removed; footer Resources uses explicit `RESOURCES_GUIDES_NAV` / `RESOURCES_MISC_NAV`; `app/error.js` localized (en + sq). |

Crawl after this round: desktop and mobile, en and sq, 33 pages each, 0 broken links.
