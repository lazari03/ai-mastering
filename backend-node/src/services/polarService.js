import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";

// Polar is a Merchant of Record — it handles global VAT/sales tax, so we
// never register in any jurisdiction ourselves. Subscription state is
// mirrored into Firestore (users/{uid}.subscription) so gating a render
// is a cheap local read, not a Polar API call on every /master request.
// Everything is plan-gated now (2 subscription tiers, no one-time
// purchases — see PRICING.md) — order.paid is handled as a no-op below
// purely so an unexpected event type never crashes the webhook handler.
//
// Customers are matched to our own users purely via externalCustomerId
// (= Firebase uid) on checkout creation — Polar creates/reuses a Customer
// with that external ID automatically, and every subsequent webhook event
// carries it back at event.data.customer.externalId. No separate mapping
// table needed.
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

let _client = null;
function client() {
  if (!settings.polarAccessToken) {
    throw new Error("Billing isn't configured — set POLAR_ACCESS_TOKEN.");
  }
  if (!_client) {
    _client = new Polar({ accessToken: settings.polarAccessToken, server: settings.polarServer });
  }
  return _client;
}

function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

// productKey is one of settings.polarProducts' keys ("planStudio",
// "planPro", "chords") — the route layer resolves the human-facing item
// name to this, this resolves it to an actual Polar product ID.
export async function createCheckoutUrl(uid, email, productKey, successUrl) {
  const productId = settings.polarProducts[productKey];
  if (!productId) {
    throw new Error(`Billing isn't configured for "${productKey}" — set its Polar product ID.`);
  }
  const checkout = await client().checkouts.create({
    products: [productId],
    externalCustomerId: uid,
    customerEmail: email || undefined,
    successUrl,
  });
  return checkout.url;
}

// Customer portal — lets a subscriber manage/cancel their own
// subscription without us building that UI ourselves. Session tokens are
// short-lived by design (Polar's own guidance): generate one fresh each
// time the user clicks "Manage billing", never cache the URL.
export async function createPortalUrl(uid) {
  const session = await client().customerSessions.create({ externalCustomerId: uid });
  return session.customerPortalUrl;
}

export async function getSubscriptionStatus(uid) {
  const doc = await userDoc(uid).get();
  const sub = doc.data()?.subscription;
  return {
    active: Boolean(sub && ACTIVE_STATUSES.has(sub.status)),
    status: sub?.status || null,
    currentPeriodEnd: sub?.currentPeriodEnd || null,
  };
}

export async function isSubscriptionActive(uid) {
  const status = await getSubscriptionStatus(uid);
  return status.active;
}

// "free" | "studio" | "pro" — the single source of truth every gating
// check (masteringRoutes.js) reads instead of juggling credit balances.
// Derived from which Polar product the active subscription is actually
// for, not just whether one exists — an active subscription against an
// unrecognized product ID (shouldn't happen outside manual Polar dashboard
// fiddling) falls back to "free" rather than granting access by accident.
export async function getPlan(uid) {
  const doc = await userDoc(uid).get();
  const sub = doc.data()?.subscription;
  if (!sub || !ACTIVE_STATUSES.has(sub.status)) return "free";
  if (sub.productId && sub.productId === settings.polarProducts.planPro) return "pro";
  if (sub.productId && sub.productId === settings.polarProducts.planStudio) return "studio";
  return "free";
}

// Verifies the signature (throws WebhookVerificationError on failure —
// the route catches this and returns 403, never processes an
// unverified body).
export function verifyWebhook(rawBody, headers) {
  return validateEvent(rawBody, headers, settings.polarWebhookSecret || "");
}

// Idempotent: a replayed subscription.* event just overwrites Firestore
// with the same data again — Polar doesn't guarantee exactly-once
// delivery, but a harmless re-write is fine. Not worth an idempotency-key
// table for v1. order.paid isn't handled — there's nothing left to grant
// (no one-time products, see PRICING.md); every route re-checks getPlan()
// fresh anyway, so a subscription.* event alone is what actually unlocks
// anything.
export async function applyWebhookEvent(event) {
  if (event.type.startsWith("subscription.")) {
    return applySubscriptionEvent(event);
  }
}

async function applySubscriptionEvent(event) {
  const sub = event.data;
  const uid = sub.customer?.externalId;
  if (!uid) {
    // A subscription whose customer was never linked to a Firebase uid —
    // shouldn't happen via our own checkout flow, but don't let an
    // unrelated/malformed event crash the webhook handler.
    console.warn(`Polar ${event.type}: no externalId on customer, skipping`, sub.customerId);
    return;
  }
  await userDoc(uid).set(
    {
      subscription: {
        status: sub.status,
        productId: sub.productId,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
        polarCustomerId: sub.customerId,
        polarSubscriptionId: sub.id,
        updatedAt: new Date(),
      },
    },
    { merge: true }
  );
}

export { WebhookVerificationError };
