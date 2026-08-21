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

// Polar's own validation errors (HTTPValidationError) carry a `detail`
// array of {loc, msg} pairs — the raw msg is Polar's internal phrasing
// ("testt@test.com is not a valid email address: The domain name
// test.com does not accept email.") and the loc is a deeply-nested
// Pydantic union path, neither fit for showing a user. This maps the one
// case actually worth distinguishing (email undeliverable) to plain
// language and falls back to a generic message for everything else,
// rather than ever surfacing Polar's raw validation JSON.
function friendlyCheckoutError(error) {
  const detail = error?.detail;
  if (Array.isArray(detail) && detail.some((d) => d.loc?.includes("customer_email"))) {
    return "That email address looks invalid or can't receive mail — double check it and try again.";
  }
  return "Couldn't start checkout right now — please try again in a moment.";
}

// productKey is one of settings.polarProducts' keys ("planStudio",
// "planPro", "chords") — the route layer resolves the human-facing item
// name to this, this resolves it to an actual Polar product ID.
export async function createCheckoutUrl(uid, email, productKey, successUrl) {
  const productId = settings.polarProducts[productKey];
  if (!productId) {
    throw new Error(`Billing isn't configured for "${productKey}" — set its Polar product ID.`);
  }
  try {
    const checkout = await client().checkouts.create({
      products: [productId],
      externalCustomerId: uid,
      customerEmail: email || undefined,
      successUrl,
    });
    return checkout.url;
  } catch (error) {
    console.error("Polar checkout creation failed:", error);
    throw new Error(friendlyCheckoutError(error));
  }
}

// Changing plan while already subscribed (Studio -> All-Access, or the
// reverse) — modifies the *existing* Polar subscription in place via
// subscriptions.update() rather than running a second checkouts.create().
// That distinction matters: checkouts.create() has no concept of "this
// customer already has a subscription," so it was creating a second,
// fully independent subscription every time someone hit "Switch" — the
// old one was never canceled, meaning a user switching plans could end
// up billed for both at once until they noticed and canceled the old one
// themselves via the portal. subscriptions.update() instead changes the
// one real subscription's product, letting Polar apply its own
// proration rules (organization-level setting — invoice the difference
// immediately, prorate, apply at next period, etc.) exactly the way a
// real subscription upgrade/downgrade is supposed to work.
// Rank by monthly price, not just enum order — this is what decides
// upgrade vs downgrade below. Free isn't in here; changeSubscriptionPlan
// is only ever called for an already-paid user switching between paid
// tiers (see the "no active subscription" guard above).
const PLAN_RANK = { planStudio: 1, planPro: 2 };

function currentProductKey(sub) {
  if (sub?.productId === settings.polarProducts.planPro) return "planPro";
  if (sub?.productId === settings.polarProducts.planStudio) return "planStudio";
  return null;
}

export async function changeSubscriptionPlan(uid, productKey) {
  const productId = settings.polarProducts[productKey];
  if (!productId) {
    throw new Error(`Billing isn't configured for "${productKey}" — set its Polar product ID.`);
  }
  const doc = await userDoc(uid).get();
  const sub = doc.data()?.subscription;
  if (!sub?.polarSubscriptionId || !isEntitled(sub)) {
    throw new Error("No active subscription to change — start a new checkout instead.");
  }

  // Deliberately explicit, not left to "whatever the Polar dashboard's
  // default happens to be" — this is the one line standing between a
  // normal upgrade and a real exploit: switch to All-Access, switch back
  // to Studio before the deferred charge ever lands, switch to
  // All-Access again — repeat forever, never actually pay the
  // All-Access price. Two rules close it completely:
  //   - Upgrading (Studio -> All-Access): "invoice" — charge the
  //     prorated difference RIGHT NOW, atomically with the access grant.
  //     There is no window where access exists without payment for it.
  //   - Downgrading (All-Access -> Studio): "next_period" — keeps the
  //     higher tier's access through the period already paid for (same
  //     principle as isEntitled()'s grace period), and the actual
  //     product/price change only takes effect at the real renewal.
  //     Nothing about this grants extra access for free — it's exactly
  //     what was already paid for, and switching back to All-Access
  //     again before that renewal is a no-op: they're still ON
  //     All-Access (the downgrade hasn't applied yet), so there's
  //     nothing to re-upgrade into and no new charge to dodge.
  const fromRank = PLAN_RANK[currentProductKey(sub)] || 0;
  const toRank = PLAN_RANK[productKey] || 0;
  const prorationBehavior = toRank > fromRank ? "invoice" : "next_period";

  try {
    const updated = await client().subscriptions.update({
      id: sub.polarSubscriptionId,
      subscriptionUpdate: { productId, prorationBehavior },
    });
    // Written immediately, not left to wait for the async webhook — the
    // update call itself already returns the new subscription state, so
    // there's no reason to make the user's UI lag behind an event that
    // will arrive a moment later and just confirm the same thing. Under
    // "next_period", Polar's own response correctly leaves productId
    // unchanged (the real change lives in pendingUpdate, applied by
    // Polar itself at the real renewal) — so this never writes an
    // early/incorrect plan into Firestore either way.
    await userDoc(uid).set({ subscription: subscriptionRecord(updated) }, { merge: true });
    return { productKey, immediate: prorationBehavior === "invoice" };
  } catch (error) {
    console.error("Polar subscription update failed:", error);
    throw new Error(friendlyCheckoutError(error));
  }
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
