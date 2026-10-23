# Frontend Audit (Next.js / React)

Date 2026-10-15 · base `e441297` · branch `claude/platform-audit-2026-10` · agents: frontend role (technical-lead), seo-analytics-engineer.
Scope: dependencies/build, error localization, analytics script, metadata. Prior detail: `docs/agent-reports/FRONTEND_REPORT.md`,
`SEO_ANALYTICS_REPORT.md` (new). Tools: `npm audit`, `next build`, `node --test`, static review. **No browser/E2E run this session.**

## Changes
| Change | Why | Files |
|---|---|---|
| `next` 16.3.5 → **16.3.8** (patch) | Critical/High public advisories in range (see SECURITY_AUDIT.md) | `package.json`, `package-lock.json` |
| Plausible loads via `next/script` | The consent-gated `<script defer>` was created client-side and React never executes client-created non-async scripts → Plausible **never ran** (ANALYTICS finding; SEO agent). Consent gating unchanged. *Browser verification pending.* | `components/Analytics.jsx` |
| Default `og:image`/`twitter:image` on every `buildMetadata` page | 30 prerendered pages shipped no preview image (observed in built HTML) | `lib/seo.js` |
| `/login` noindex; `llms.txt` lists pricing/tools/LUFS meter | indexable auth page; incomplete LLM summary | `app/login/page.js`, `public/llms.txt` |
| Error codes `service_unavailable`, `unsupported_format` localized (en + sq) | new gateway codes (BACKEND_AUDIT.md) | `lib/i18n.js`, `lib/masteringErrors.js` |
| Docker image Node 20 → 22 | match CI (DEVOPS-005) | `frontend/Dockerfile` |

Albanian strings were written by the agent team; a native-speaker review is recommended before release.

## Verification
- `NEXT_PUBLIC_SITE_URL=https://auralithforge.app npm run build` → **pass** (56 routes) after a clean `.next`. (Without the env var the build intentionally fails fast — same as CI.)
- `node --test tests/localized-imports.test.mjs` → 1/1 pass.
- 0 `.map` files under `.next/static` (no public source maps).

## Open (unchanged, tracked)
FRONTEND-001 (Pro knobs silently ignored on free preview), FRONTEND-002 (a11y: `aria-pressed`, `aria-current`, waveform text alternative),
PRODUCT-002 (server-rendered/Node messages English-only), SEO-001..004 / ANALYTICS-001..002 (see SEO report), no unit/E2E suite for UI flows.

## Remaining risks
No browser journey executed (needs a Firebase test project). Plausible fix verified by build + code reading only.
