import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";
import { notifyPurchase } from "./telegramService.js";

// Polar is a Merchant of Record — it handles global VAT/sales tax, so we
// never register in any jurisdiction ourselves. Subscription state is
// mirrored into Firestore (users/{uid}.subscription / .chordSubscription)
// so gating a render is a cheap local read, not a Polar API call on every
// /master request. Three subscription products (Studio/All-Access for
// mastering, Chords Monthly standalone) plus two one-time products
// (single-master, single chord detection) for whoever's actual need is
// one track, not a recurring plan (see entitlementsService.js's
// extra-credit functions). order.paid is how those one-time purchases
// actually grant anything.
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

// Reverse-lookup from a Polar product ID back to a human label — the
// Telegram purchase notification (see announcePurchase below) should read
// "Studio plan", not a raw Polar product UUID.
const PRODUCT_LABELS = {
  planStudio: "Studio plan",
  planPro: "All-Access plan",
  singleMaster: "Single Master (one-time)",
  chordDetection: "Chord Detection (one-time)",
  chordsMonthly: "Chords Monthly",
  stemSeparation: "Stem Separation add-on",
};

function productLabel(productId) {
  const key = Object.entries(settings.polarProducts).find(([, id]) => id === productId)?.[0];
  return (key && PRODUCT_LABELS[key]) || productId || "Unknown product";
}

// Server-side GA4 "purchase" conversion — fires from the Polar webhook,
// never touching the visitor's browser, so it's immune to ad-blockers and
// closed tabs during checkout redirect (the two ways the client-side copy
// of this event, ThankYouTracker.jsx, silently loses real purchases).
// client_id is the uid itself rather than the visitor's actual GA cookie
// value — GA4 requires *some* client_id on every Measurement Protocol
// event, and stitching this to the exact browsing session that started
// checkout would mean threading the real _ga client_id through Polar
// checkout metadata and back out of the webhook payload, a bigger
// integration this doesn't attempt. Using the uid still gets an accurate
// purchase count/revenue total in GA4's reports (the actual gap this is
// closing) — session-level attribution to referrer/campaign is the only
// thing this simplification gives up.
async function sendGA4Purchase({ uid, transactionId, productId, amountCents, currency }) {
  if (!settings.gaMeasurementId || !settings.gaApiSecret || !uid) return;
  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${settings.gaMeasurementId}&api_secret=${settings.gaApiSecret}`;
    await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        client_id: uid,
        events: [
          {
            name: "purchase",
            params: {
              currency: currency || "EUR",
              value: (amountCents ?? 0) / 100,
              transaction_id: transactionId,
              items: [{ item_id: productId || "unknown", item_name: productLabel(productId) }],
            },
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Failed to send GA4 server-side purchase event (non-fatal):", error);
  }
}

// Fires the Telegram notification, the GA4 server-side purchase event,
// and appends to the purchaseEvents log the bot's /stats command reads
// (see telegramService.js) — one shared place so both the subscription
// and one-time-order paths below record a purchase identically.
// Best-effort end to end: none of these may ever throw back into a
// webhook handler, since a notification failing is not a reason to make
// Polar retry an already-applied event.
async function announcePurchase({ kind, product, email, amountCents, currency, uid, transactionId, productId }) {
  try {
    await getFirestore()
      .collection("purchaseEvents")
      .add({ kind, product, email: email || null, amountCents: amountCents ?? null, currency: currency || null, at: new Date() });
  } catch (error) {
    console.error("Failed to record purchase event (non-fatal):", error);
  }
  await sendGA4Purchase({ uid, transactionId, productId, amountCents, currency });
  await notifyPurchase({ kind, product, email, amountCents, currency });
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

// Independent of the main plan — a Free or Studio user can subscribe to
// this on its own for unlimited chord detection without touching their
// mastering plan at all (and All-Access users don't need it, they
// already have unlimited chords bundled). Lives in its own Firestore
// field (chordSubscription, not subscription) so the two can never
// overwrite each other — see subscriptionFieldForProduct below.
export async function getChordSubscriptionActive(uid) {
  const doc = await userDoc(uid).get();
  return isEntitled(doc.data()?.chordSubscription);
}

// Verifies the signature (throws WebhookVerificationError on failure —
// the route catches this and returns 403, never processes an
// unverified body).
export function verifyWebhook(rawBody, headers) {
  return validateEvent(rawBody, headers, settings.polarWebhookSecret || "");
}

// subscription.* is naturally idempotent — a replayed event just
// overwrites Firestore with the same data again, harmless. order.paid is
// NOT naturally idempotent — granting a credit is an increment, and
// Polar doesn't guarantee exactly-once delivery, so a redelivered event
// without a guard would double- (or triple-) grant the same purchase.
// applyOrderPaidEvent below guards against that explicitly.
export async function applyWebhookEvent(event) {
  if (event.type.startsWith("subscription.")) {
    return applySubscriptionEvent(event);
  }
  if (event.type === "order.paid") {
    return applyOrderPaidEvent(event);
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

// Maps a recurring product ID to which Firestore field its subscription
// record belongs in. The main plan (Studio/All-Access) and the standalone
// Chords Monthly subscription are two independent things a user can hold
// at the same time — writing them to different fields means subscribing
// to one can never silently overwrite/clobber the other, unlike the
// single-field design that worked fine back when there was only ever one
// possible subscription per customer.
function subscriptionFieldForProduct(productId) {
  if (productId === settings.polarProducts.planStudio || productId === settings.polarProducts.planPro) {
    return "subscription";
  }
  if (productId === settings.polarProducts.chordsMonthly) {
    return "chordSubscription";
  }
  return null;
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
  const field = subscriptionFieldForProduct(sub.productId);
  if (!field) {
    console.warn(`Polar ${event.type}: unrecognized product ${sub.productId}, skipping`);
    return;
  }
  await userDoc(uid).set({ [field]: subscriptionRecord(sub) }, { merge: true });

  // subscription.* also fires for renewals, cancellations, and plan
  // changes — "created" is the one event that actually means "someone
  // just subscribed," so that's the only one that announces as a
  // purchase. Fired after the write, best-effort (announcePurchase itself
  // never throws either).
  if (event.type === "subscription.created") {
    await announcePurchase({
      kind: "New subscription",
      product: productLabel(sub.productId),
      email: sub.customer?.email,
      amountCents: sub.amount,
      currency: sub.currency,
      uid,
      transactionId: sub.id,
      productId: sub.productId,
    });
  }
}

// Maps a one-time product ID to which Firestore credit field it tops up.
// Anything else (a future one-time product this function doesn't know
// about yet, or — shouldn't happen — a subscription product somehow
// producing an order.paid) is silently ignored rather than assumed to
// mean "grant a master credit," which is what a single hardcoded check
// used to do before there were two different one-time products.
function creditFieldForProduct(productId) {
  if (productId === settings.polarProducts.singleMaster) return "extraMasterCredits";
  if (productId === settings.polarProducts.chordDetection) return "extraChordCredits";
  if (productId === settings.polarProducts.stemSeparation) return "extraStemCredits";
  return null;
}

// Idempotency guard: processedPolarOrders/{orderId} + the credit
// increment happen in the SAME transaction, spanning both documents —
// either both happen or neither does. A redelivered order.paid for an
// order already recorded here is a no-op, not a second free credit.
async function applyOrderPaidEvent(event) {
  const order = event.data;
  const creditField = creditFieldForProduct(order.productId);
  if (!creditField) return;
  const uid = order.customer?.externalId;
  if (!uid) {
    console.warn(`Polar order.paid: no externalId on customer, skipping`, order.customerId);
    return;
  }

  const db = getFirestore();
  const orderRef = db.collection("processedPolarOrders").doc(order.id);
  const userRef = userDoc(uid);
  // Reports back whether this call actually applied the credit, not just
  // whether the transaction ran — a redelivered event must never trigger
  // a second "you got paid" notification for the same order.
  const alreadyProcessed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists) return true; // already processed — Polar redelivered this event
    const userSnap = await tx.get(userRef);
    const credits = Number(userSnap.data()?.[creditField] || 0);
    tx.set(orderRef, { uid, processedAt: new Date() });
    tx.set(userRef, { [creditField]: credits + 1 }, { merge: true });
    return false;
  });

  if (!alreadyProcessed) {
    await announcePurchase({
      kind: "New purchase",
      product: productLabel(order.productId),
      email: order.customer?.email,
      amountCents: order.totalAmount,
      currency: order.currency,
      uid,
      transactionId: order.id,
      productId: order.productId,
    });
  }
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
// Deliberately conservative: only overwrites a field when Polar actually
// returns a subscription that maps to it. Nothing returned at all logs a
// warning instead of clearing existing records — a transient Polar API
// hiccup shouldn't be able to falsely downgrade a real subscriber to
// Free. limit:10 (not 1) because a customer can now hold two concurrent
// subscriptions (main plan + chords) — sorted newest-first, so the first
// item seen per field is that field's most current subscription; a
// second/older item for the same field (e.g. a canceled-then-resubscribed
// history) is intentionally skipped.
export async function reconcileUserSubscription(uid) {
  const page = await client().subscriptions.list({ externalCustomerId: uid, limit: 10, sorting: ["-started_at"] });
  const items = page.result?.items || [];
  if (!items.length) {
    console.warn(`Reconciliation: Polar returned no subscriptions for uid ${uid} — leaving existing records untouched`);
    return false;
  }
  const seenFields = new Set();
  let changed = false;
  for (const sub of items) {
    const field = subscriptionFieldForProduct(sub.productId);
    if (!field || seenFields.has(field)) continue;
    seenFields.add(field);
    await userDoc(uid).set({ [field]: subscriptionRecord(sub) }, { merge: true });
    changed = true;
  }
  return changed;
}

// Batch pass over every user with EITHER kind of subscription on file —
// run periodically (see server.js) rather than on a request path, since
// it's one Polar API call per user and isn't something a page load
// should wait on. Two separate field queries, unioned into one uid set —
// Firestore can't OR across different field existence checks in a single
// query. Per-user failures are caught and logged individually so one bad
// record can't stop the rest of the batch from reconciling.
export async function reconcileAllSubscriptions() {
  const db = getFirestore();
  const [planSnapshot, chordSnapshot] = await Promise.all([
    db.collection("users").where("subscription", "!=", null).get(),
    db.collection("users").where("chordSubscription", "!=", null).get(),
  ]);
  const uids = new Set([...planSnapshot.docs.map((d) => d.id), ...chordSnapshot.docs.map((d) => d.id)]);
  let reconciled = 0;
  for (const uid of uids) {
    try {
      const changed = await reconcileUserSubscription(uid);
      if (changed) reconciled += 1;
    } catch (error) {
      console.error(`Reconciliation failed for uid ${uid}:`, error);
    }
  }
  console.log(`Reconciliation pass complete: ${reconciled}/${uids.size} accounts synced from Polar`);
  return { checked: uids.size, reconciled };
}

export { WebhookVerificationError };
