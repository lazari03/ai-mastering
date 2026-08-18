# Polar Setup

Polar is the Merchant of Record for the Professional tier ($19/mo) — it
handles global VAT/sales tax, invoicing, and payment processing so you
never register for tax collection yourself. This is the one-time setup;
the code side is already built (see `backend-node/src/services/polarService.js`).

## 1. Create an account and organization

1. Go to [polar.sh](https://polar.sh) and sign up.
2. Create an organization (this is who gets paid).
3. **Start in sandbox** — [sandbox.polar.sh](https://sandbox.polar.sh) is a
   fully separate environment with fake payments, same UI. Do your first
   end-to-end test there before touching production.

## 2. Create the Professional product

1. Sandbox dashboard → **Products** → **New Product**.
2. Name: `Professional`. Pricing: **Recurring**, **Monthly**, **$19.00**.
3. Save, then copy the product's ID (looks like a UUID) from its detail
   page — this is `POLAR_PROFESSIONAL_PRODUCT_ID`.

## 3. Create an access token

1. Dashboard → **Settings → API Keys** (org-level, not personal).
2. Create a token with at minimum `checkouts:write`, `customer_sessions:write`,
   `customer_portal:read` scopes (or just grant full access for simplicity
   while testing).
3. This is `POLAR_ACCESS_TOKEN`.

## 4. Set up the webhook

1. Dashboard → **Settings → Webhooks → Add Endpoint**.
2. URL: `https://api.auralithforge.app/webhooks/polar` (sandbox: point it
   at wherever your dev server is reachable — use `ngrok` or similar for
   local testing, Polar can't reach `localhost` directly).
3. Subscribe to: `subscription.created`, `subscription.active`,
   `subscription.canceled`, `subscription.revoked`, `subscription.updated`.
4. Copy the **signing secret** — this is `POLAR_WEBHOOK_SECRET`.

## 5. Set the env vars

In `backend-node/.env`:
```
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_WEBHOOK_SECRET=whsec_...
POLAR_PROFESSIONAL_PRODUCT_ID=<the product UUID from step 2>
POLAR_ENVIRONMENT=sandbox
```

Restart `backend-node`. Until these are set, the Professional tier stays
**ungated** (no paywall, not a crash) — see the comment in
`masteringRoutes.js`'s `/master` handler.

## 6. Test the full loop (sandbox)

1. In the app, go to Settings → Billing → **Upgrade to Professional**.
2. You're redirected to a Polar-hosted checkout — use a
   [test card](https://polar.sh/docs/integrate/testing) (sandbox never
   charges real money).
3. After checkout, Polar sends `subscription.active` to your webhook.
   Check `backend-node`'s logs — you should see it applied. If the
   webhook payload shape doesn't match what the code expects (I verified
   against the SDK's own TypeScript types, but never against a real live
   event — this is the one part of the integration I could not test end
   to end without an account), the raw event is enough to see in the logs
   to fix it fast.
4. Settings → Billing should now show "Professional — active", and
   selecting the Professional engine tier in Master Audio should no
   longer be rejected.
5. Test cancellation via **Manage billing** (the customer portal link) —
   confirm the app correctly reverts to Standard-only after the
   `subscription.revoked`/`canceled` webhook lands.

## 7. Go to production

1. Repeat steps 2-4 on the real [polar.sh](https://polar.sh) dashboard
   (not sandbox) — different product ID, different token, different
   webhook secret.
2. Set `POLAR_ENVIRONMENT=production` and swap in the production values.
3. Polar requires a short account review before you can accept real
   payments — submit that from the dashboard once you're ready to launch.
