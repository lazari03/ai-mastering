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

// A subscription counts as entitled if Polar reports it active/trialing,
// OR its already-paid-for period hasn't ended yet — the latter matters
// for "canceled" (self-service cancellation keeps access through the
// period already paid for, standard SaaS behavior) and "past_due" (a
// failed renewal charge that Polar is still retrying keeps the *previous*
// period's access intact rather than cutting it off the instant the new
// charge fails). Once currentPeriodEnd actually passes with nothing
// having renewed it, access lapses on its own — no separate expiry timer
// or cron job needed for that half of it.
function subscriptionPeriodEndDate(sub) {
  const raw = sub?.currentPeriodEnd;
  if (!raw) return null;
  // Firestore returns Timestamp objects (have .toDate()); a freshly-built
  // record in this same process is a plain JS Date. Handle both.
  const date = typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isEntitled(sub) {
  if (!sub) return false;
  if (ACTIVE_STATUSES.has(sub.status)) return true;
  const periodEnd = subscriptionPeriodEndDate(sub);
  return Boolean(periodEnd && periodEnd.getTime() > Date.now());
}

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
    active: isEntitled(sub),
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
  if (!isEntitled(sub)) return "free";
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

// Shared by the webhook handler and reconciliation below — one place that
// knows how a Polar subscription object maps onto the Firestore record,
// so the two paths can never silently drift into writing different shapes.
function subscriptionRecord(sub) {
  return {
    status: sub.status,
    productId: sub.productId,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    polarCustomerId: sub.customerId,
    polarSubscriptionId: sub.id,
    updatedAt: new Date(),
  };
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
  await userDoc(uid).set({ subscription: subscriptionRecord(sub) }, { merge: true });
}

// Reconciliation backstop — webhooks are the fast path, this is what
// catches the case a webhook never arrives at all (endpoint down during a
// deploy, wrong URL registered, etc.), which the retry-on-500 fix in
// webhookRoutes.js can't help with since there's no webhook delivery to
// retry in the first place. Asks Polar directly for the ground truth on
// one user's subscriptions and overwrites Firestore to match — same
// subscriptionRecord() shape the webhook path writes, so a reconciled
// record is indistinguishable from a webhook-updated one.
//
// Deliberately conservative: only overwrites when Polar actually returns
// a subscription. An empty result logs a warning instead of clearing the
// existing record — a transient Polar API hiccup returning nothing
// shouldn't be able to falsely downgrade a real subscriber to Free.
export async function reconcileUserSubscription(uid) {
  const page = await client().subscriptions.list({ externalCustomerId: uid, limit: 1, sorting: ["-started_at"] });
  const [latest] = page.result?.items || [];
  if (!latest) {
    console.warn(`Reconciliation: Polar returned no subscriptions for uid ${uid} — leaving existing record untouched`);
    return false;
  }
  await userDoc(uid).set({ subscription: subscriptionRecord(latest) }, { merge: true });
  return true;
}

// Batch pass over every user with a subscription on file — run
// periodically (see server.js) rather than on a request path, since it's
// one Polar API call per user and isn't something a page load should
// wait on. Per-user failures are caught and logged individually so one
// bad record can't stop the rest of the batch from reconciling.
export async function reconcileAllSubscriptions() {
  const snapshot = await getFirestore().collection("users").where("subscription", "!=", null).get();
  let reconciled = 0;
  for (const doc of snapshot.docs) {
    try {
      const changed = await reconcileUserSubscription(doc.id);
      if (changed) reconciled += 1;
    } catch (error) {
      console.error(`Reconciliation failed for uid ${doc.id}:`, error);
    }
  }
  console.log(`Reconciliation pass complete: ${reconciled}/${snapshot.size} subscriptions synced from Polar`);
  return { checked: snapshot.size, reconciled };
}

export { WebhookVerificationError };
