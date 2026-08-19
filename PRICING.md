# Pricing

Three plans, not a subscription plus a pile of à la carte items.

## Free — €0
- **Clean Audio** — unlimited, no paywall at all.
- **Master Audio (preview)** — 30-second truncated render, Standard engine
  only, no stem separation. Unlimited.
- **3 full-length Standard masters / month** — real, downloadable files,
  no watermark, no truncation. Resets every calendar month. No Professional
  tier, no stem separation.
- **Chord detection** — €1.49/analysis (one-time credit, no free tier for
  this one — see below).

## Studio — €9.99/mo
Everything Free has, plus:
- **Unlimited** full-length Standard **and** Professional mastering (no
  monthly cap).
- **Stem separation included**, no extra charge.
- Chord detection is still €1.49/analysis (not included).

## All-Access — €19.99/mo
Everything Studio has, plus:
- **Unlimited chord detection.**

That's the whole model — mastering and stems are gated by plan tier, not
credits. Chord detection is the one thing that stays a small one-time
purchase for Free/Studio users who don't want to jump straight to the top
plan just for it.

## How it's enforced

- **Plan** is derived from the active Polar subscription's product ID
  (`polarService.js:getPlan()`) — `"free"`, `"studio"`, or `"pro"`. Checked
  first in `/master`'s gating (`masteringRoutes.js`): Professional tier and
  stem separation require `"studio"` or `"pro"`; Free falls through to the
  monthly quota check below.
- **Free quota** (3 Standard masters/month) lives in Firestore at
  `users/{uid}.freeQuota = { month, used }`, spent atomically via a
  Firestore transaction (`entitlementsService.js`) — **only after** the
  render actually succeeds, so a failure never costs the user a slot they
  didn't get value from. Resets automatically the first time a new
  calendar month is seen, no cron job needed.
- **Chord credits** work the same way as before — `users/{uid}.credits.chords`,
  topped up by a Polar one-time-purchase webhook (`order.paid`), spent only
  after a successful analysis. `plan === "pro"` bypasses this check
  entirely (unlimited).
- Every paywall has a **"not configured yet" escape hatch**: if the
  relevant `POLAR_*_PRODUCT_ID` env var isn't set, that specific gate
  stays open instead of 402ing every request. This means local dev and a
  partially-configured launch degrade to "free" rather than "broken" —
  see the individual route handlers in `masteringRoutes.js`.

## Env vars (see `.env.example`, walkthrough in `POLAR_SETUP.md`)

```
POLAR_PLAN_STUDIO_PRODUCT_ID=  # €9.99/mo recurring
POLAR_PLAN_PRO_PRODUCT_ID=     # €19.99/mo recurring
POLAR_CHORDS_PRODUCT_ID=       # €1.49 one-time
```

`backend-node/scripts/seed-polar-products.js` creates all 3 in one run —
paste the printed IDs into `.env`. If you're migrating off the old
5-product model (`POLAR_SUBSCRIPTION_PRODUCT_ID` /
`POLAR_MASTER_STANDARD_PRODUCT_ID` / `POLAR_MASTER_PROFESSIONAL_PRODUCT_ID` /
`POLAR_STEM_ADDON_PRODUCT_ID`), archive those in the Polar dashboard — the
app no longer reads them.
