import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";
import { applyOrderEvent } from "./entitlementsService.js";

// Polar is a Merchant of Record — it handles global VAT/sales tax, so we
// never register in any jurisdiction ourselves. Subscription state is
// mirrored into Firestore (users/{uid}.subscription) so gating a render
// is a cheap local read, not a Polar API call on every /master request.
// One-time purchases (see entitlementsService.js) work the same way via
// order.paid events.
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

// productKey is one of settings.polarProducts' keys ("subscription",
// "masterStandard", "masterProfessional", "chords", "stemAddon") — the
// route layer resolves the human-facing item name to this, this resolves
// it to an actual Polar product ID.
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

// Verifies the signature (throws WebhookVerificationError on failure —
// the route catches this and returns 403, never processes an
// unverified body).
export function verifyWebhook(rawBody, headers) {
  return validateEvent(rawBody, headers, settings.polarWebhookSecret || "");
}

// Idempotent: replays of the same event just overwrite with the same data
// (subscription) or, for order.paid, would double-grant a credit on a
// true replay — Polar doesn't guarantee exactly-once delivery, but retries
// are rare in practice and a duplicate credit is a minor, refundable
// mistake, not a security issue. Not worth an idempotency-key table for v1.
export async function applyWebhookEvent(event) {
  if (event.type.startsWith("subscription.")) {
    return applySubscriptionEvent(event);
  }
  if (event.type === "order.paid") {
    return applyOrderEvent(event.data);
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
