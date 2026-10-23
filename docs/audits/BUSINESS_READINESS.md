# Business Readiness

Date 2026-10-15 · base `e441297` · agents: product-specialist (prior report, reused), growth-marketer + payments-engineer roles, performance-engineer (costs).
Sources: `.claude/knowledge/PRODUCT_RULES.md`, `docs/agent-reports/PRODUCT_REPORT.md` (2026-10-10, still valid: no product changes since),
`PAYMENTS_AUDIT.md`, `SEO_ANALYTICS_REPORT.md`, `SCALABILITY_REPORT.md`.
**Data availability:** revenue, subscriber counts, churn, traffic, CTR and conversion rates are **MISSING** — no Polar, GSC, GA4 or Plausible
data was accessible, and the in-app funnel reports "Paid" as 0 because of a tracking defect (ANALYTICS-001). Nothing below is observed customer data.

## Product value (independent of "the website works")
| Dimension | Assessment | Evidence |
|---|---|---|
| Audio engine | Technically sound under objective measurement on synthetic + lab cases; **perceptual quality unproven** | 0 drift / 21 synthetic tracks; API lab 28/33 PASS; listening evidence PENDING (QA-001, P0 blocked on licensed audio + listeners) |
| Billing | Ledger invariants hold; no entitlement bypass found; two P2 subscription-state bugs (BACKEND-009/010) can show a paying user as Free | PAYMENTS_AUDIT.md |
| Reliability | Single VPS, no backups, no memory limits, deploy without rollback | DEVOPS_AUDIT.md |
| Customer experience | Full flow exists (upload → preview → master → A/B → download/share); no browser E2E evidence this session | FRONTEND_AUDIT.md |

## Pricing vs value (€19.99 All-Access)
Verdict carried forward from the product specialist and re-checked against code: **not yet justified for most buyers**.
All-Access = 2× Studio's price for 5× volume (250/mo), 20 stems/mo and share links; the Professional engine has no measured audible
advantage (PRODUCT-001). Studio (€9.99) is the sensible featured plan. No price change is proposed (product-owner decision).

## Unit economics (MODELED — see SCALABILITY_REPORT.md for inputs)
Cost per job and per active customer are derived from measured render time/RAM in this container and an assumed VPS price; they are
**estimates**, not invoices. See SCALABILITY_REPORT.md §"Cost per job". Key structural facts (from code, OBSERVED):
- Every render — including unlimited free 30 s previews and anonymous previews — consumes the same scarce resource (python-service CPU/RAM).
- The heaviest paying users (All-Access, 250 masters + 20 Demucs stems) cost the most compute per € of revenue; stems are the most expensive job type.
- Marginal infra cost is a step function (one VPS until the first bottleneck), so gross margin depends on utilisation, not per-job cost.

## Growth recommendations (zero/low cost)
| # | Target customer | Hypothesis | Mechanism | Cost | Metric | Evidence quality |
|---|---|---|---|---|---|---|
| 1 | Anyone already visiting | Fixing broken measurement precedes any growth bet | Ship Plausible fix + ANALYTICS-001/002 so signup→master→paid is measurable | S eng | Funnel completeness; non-zero "Paid" | High (code-verified defects) |
| 2 | Bedroom producers searching free tools | Free LUFS/key/BPM/chord tools are the top of funnel | Each tool page ends in a "master this track" CTA carrying the analysed file; track tool→signup | S | tool page → signup rate | Medium (pages exist; conversion unknown) |
| 3 | Albanian-speaking musicians | An un-contested language market | Real `/sq/` URLs + hreflang (SEO-*) | M | sq impressions/signups | Low–Medium (no market data) |
| 4 | Producers sharing with clients | Share links are a viral loop | Branded share page with "master your own" CTA + referral credit (1 free master) | S–M | shares → new signups | Medium (feature exists, loop not instrumented) |
| 5 | Newsletter subscribers | Discount code converts fence-sitters | Brevo onboarding sequence (3 mails: preview → A/B verdict → discount expiry) | S | open→checkout | Low (no list data) |
| 6 | Studios/engineers | All-Access needs a non-volume reason | Album mastering + batch + persistent library (PRODUCT-003/005) | L | All-Access share of paid | Medium (competitor norm, product report) |
No paid acquisition recommended until #1 makes CAC measurable and QA-001 allows quality claims.

## Readiness verdict
**Commercially: Conditional.** Sell Indie/Studio on measurable features with the existing qualified claims. Do not push All-Access
or quality-based marketing until listening evidence exists and the subscription-state bugs are fixed.
