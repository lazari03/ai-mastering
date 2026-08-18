# Pricing

## Free
- **Clean Audio** — unlimited, no paywall at all.
- **Master Audio (preview)** — 30-second truncated render, Standard engine
  only, no stem separation. Enough to hear what the engine does; not a
  usable file. Unlimited.

## Pay-per-use (no subscription required)
| Item | Price | Unlocks |
|---|---|---|
| Master credit — Standard | €2.99 | one full-length Standard-tier render |
| Master credit — Professional | €4.99 | one full-length Professional-tier render |
| Stem separation add-on | €1.99 | adds stem-aware processing to your next master (consumed alongside a master credit, or free if you're subscribed) |
| Chord detection credit | €1.49 | one full chord/key/BPM analysis (no free preview for this one) |

## Subscription — All-Access, €19/mo
Unlimited full-length Standard **and** Professional mastering, unlimited
Chord Detection, stem separation included at no extra charge. This is
deliberately the only subscription tier — one price that unlocks
everything, instead of a confusing plan matrix.

## How it's enforced

- **Credits** live in Firestore at `users/{uid}.credits` — one counter per
  item (`masterStandard`, `masterProfessional`, `chords`, `stemAddon`).
  Topped up by a Polar one-time-purchase webhook (`order.paid`), spent
  atomically via a Firestore transaction (`entitlementsService.js`) —
  **only after** the underlying render/analysis actually succeeds, so a
  failure never costs the user a credit they didn't get value from.
- **Subscription** status lives at `users/{uid}.subscription`, kept in
  sync by Polar's `subscription.*` webhooks (`polarService.js`). An active
  subscription bypasses every credit check — checked first, before
  touching credits at all.
- Every paywall has a **"not configured yet" escape hatch**: if the
  relevant `POLAR_*_PRODUCT_ID` env var isn't set, that specific gate
  stays open instead of 402ing every request. This means local dev and a
  partially-configured launch degrade to "free" rather than "broken" —
  see the individual route handlers in `masteringRoutes.js`.

## Env vars (see `.env.example`, walkthrough in `POLAR_SETUP.md`)

```
POLAR_SUBSCRIPTION_PRODUCT_ID=        # €19/mo recurring
POLAR_MASTER_STANDARD_PRODUCT_ID=     # €2.99 one-time
POLAR_MASTER_PROFESSIONAL_PRODUCT_ID= # €4.99 one-time
POLAR_CHORDS_PRODUCT_ID=              # €1.49 one-time
POLAR_STEM_ADDON_PRODUCT_ID=          # €1.99 one-time
```

Each needs its own product created in the Polar dashboard (four one-time,
one recurring) — `POLAR_SETUP.md` §2 walks through creating one; repeat
for the other four with their own name/price/type.
