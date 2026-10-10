# Pricing, entitlements and public claims

## 1. What each plan actually gets (verified against the server)

Single sources: `backend-node/src/services/entitlementsService.js`
(limits), `masteringRoutes.js` `/master` (gates), `frontend/src/lib/pricing.js`
and `lib/product.js` (what the site says; both read the same numbers).

| Plan | Price | Masters | Engine | Stems | Share links |
|---|---|---|---|---|---|
| Free | €0 | 3 total, never resets | Standard | buy per use (€4.99) | no |
| Indie | €4.99/mo · €49.90/yr | 15/month | Standard | buy per use | no |
| Studio | €9.99/mo · €99.90/yr | 50/month | Standard + Professional | buy per use | no |
| **All-Access** | **€19.99/mo · €199.90/yr** | **250/month** | Standard + Professional | **20/month included**, then €4.99 each | yes |
| Single Master | €2.99 one-time | +1 credit, used only after quota runs out | plan's | — | — |

Server and site agree on every row (`PLAN_MASTER_LIMITS = {free: 3, indie: 15,
studio: 50, pro: 250}`, `STEM_MONTHLY_LIMIT = 20`, Professional gated to
`studio`/`pro`, share links gated to `pro`). Annual prices are exactly 10×
monthly.

## 2. Billing reliability checklist

| Requirement | Status | Evidence |
|---|---|---|
| Correct entitlements per plan | ✅ | table above; `polarBilling.test.js` (monthly/annual → same plan) |
| Master credit deduction | ✅ | reserved atomically before render (`consumeMasterQuota` transaction) |
| Stem quota deduction | ✅ **fixed** | was consumed after render and unchecked (A2); now reserved; `renderReservation.test.js` |
| Failed job never consumes a credit | ✅ | master + stem released in the route's catch; tests cover quota and credit paths |
| Stem separation that silently didn't run is not charged | ✅ **fixed** | was intended but unreachable: the branch threw `ReferenceError` (A3); now refunds the stem part only |
| Retries can't double-charge | ✅ | each request reserves once and releases at most once (`releaseRenderSlots` nulls what it refunded; double release tested) |
| Concurrent jobs can't exceed quota | ✅ | 5 concurrent stem renders / 1 credit → 1 (tested); master gate unchanged (tested) |
| Upgrade / downgrade | ✅ | `prorationForChange`: upgrades and monthly→annual invoice now, everything else next period (tested) |
| Cancellation | ✅ **now tested** | scheduled cancel keeps access to period end; ended/revoked/unpaid loses it immediately (`entitlementLifecycle.test.js`) |
| Webhook signature verification | ✅ | `validateEvent` on the raw body, mounted before `express.json()`; failure → 403 + logged |
| Webhook idempotency / duplicate payments | ✅ | `processedPolarOrders/{orderId}` written in the same transaction as the credit; refunds idempotent |
| Out-of-order events | ✅ | stale `modifiedAt` skipped |
| Authorization | ✅ | every user route behind `requireAuth`; job routes check `ownsJob`; Python service not publicly exposed |
| Quota bypass via Professional / stems on a lower plan | ✅ | both refused with 402 before any reservation |
| Upstream timeout refund | ✅ | a timed-out render (A4) throws → slot refunded; user sees a clear 504 |

**Residual risks (not defects):** a refund that itself fails (Firestore
outage) is logged for manual correction, not retried; `refundCredit` has no
upper clamp, which is safe only because each reservation is released at
most once, as the code now guarantees.

## 3. Claims audit

### Corrected

| Where | Was | Now | Why |
|---|---|---|---|
| Homepage FAQ, Help (EN + SQ), console engine option | Professional = "true-peak limiting" / "transient-aware clipper" / "keeps more punch" (claims made earlier in this project's history) | "Professional adds finer low-end control: when compression is needed, it gives the sub and the kick/bass their own bands." Engine option: "Professional (sub/punch band split)" | Both engines share the limiter and clipper; no punch advantage measured (AURALITH_AUDIT A6) |
| Genre pages (4 lines) | "Professional mode gives full manual control…" | "Pro Master mode (manual controls, on every plan)…" | Manual mode is free on every plan; "Professional" is the paid engine |
| Homepage pricing grid, Plans panel, comparison table | English for every visitor | English / Albanian via `{en, sq}` + `localized()` | Localization requirement; verified in Chromium |

### Verified accurate (no change)

- **Chord, key and BPM detection: free on every plan.** Every surface says
  free (`/chord-detector`, `/pricing`, FAQ, comparison table, terms, refund
  page). The server has no quota or credit check on `/analyze-chords`.
  "Unlimited / no limit" is accurate as a plan statement; the only cap is
  the shared fair-use rate limit (20 expensive requests per 15 min per
  account, shared with masters and previews), which is abuse protection,
  not a usage limit. The legacy paid chord products (`chordsMonthly`,
  `chordDetection`) are no longer sold anywhere; their webhook handlers
  remain as harmless dead paths. **No current contradiction found.** If the
  contradiction you had in mind is a page I didn't find, it isn't in
  `frontend/src`, `README.md` or the SEO docs at `d9c591a`.
- **Free trial:** "3 full-length masters, one-time" matches the lifetime
  counter.
- **Stems:** "vocals and accompaniment", 20/month on All-Access, €4.99
  otherwise — matches `STEM_MONTHLY_LIMIT` and the Demucs two-stem path.
- **Previews:** 30 s, Standard engine, free and unlimited — matches the
  route (previews never reach the billing block).
- **No guaranteed-quality claims.** No "industry-standard", "radio-ready
  guaranteed", "better than a human" or competitor-superiority claim. The
  eMastered comparison says "'Better' depends on your ears and your track".
  "Radio-Ready" appears once as a pop-genre headline descriptor, not a
  guarantee.
- **Structured data:** `lib/seo.js` derives the price range from `PLANS`
  (EUR), so it can't drift from the pricing grid.

### Open

- Server-rendered pages (`/pricing`, genre, tool, legal pages) and backend
  error messages are English-only (AURALITH_AUDIT A13).
- The pricing grid lists "Standard & Professional engines" as a Studio
  feature. Accurate, but given A6 it sells a difference most customers will
  never hear. Recommendation in RELEASE_READINESS.
