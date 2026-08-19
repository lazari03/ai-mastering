import { getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";

// Pay-per-use credits — separate from the subscription (see polarService.js
// for that). Each one-time Polar purchase increments exactly one bucket
// here; each paid action (a full master render, a stem-separation add-on,
// a chord detection) consumes exactly one, only if no active subscription
// already covers it for free. Stored at users/{uid}.credits so checking
// entitlement before a render is a local Firestore read, not a Polar API
// call — same pattern as subscription status.
const CREDIT_KEYS = ["masterStandard", "masterProfessional", "chords", "stemAddon"];

// Maps a Polar product ID (from settings.polarProducts) to the credit
// bucket it tops up. Built lazily, not at module load, so it always
// reflects whatever env vars are actually set — an unset product ID here
// just means that purchase can never match a webhook (which can't happen
// anyway since checkout would already have 400'd for it).
function productToCreditKey() {
  const map = {};
  for (const key of CREDIT_KEYS) {
    const productId = settings.polarProducts[key];
    if (productId) map[productId] = key;
  }
  return map;
}

function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

export async function getCredits(uid) {
  const doc = await userDoc(uid).get();
  const credits = doc.data()?.credits || {};
  return Object.fromEntries(CREDIT_KEYS.map((key) => [key, Number(credits[key] || 0)]));
}

export async function grantCredit(uid, creditKey, amount = 1) {
  if (!CREDIT_KEYS.includes(creditKey)) {
    throw new Error(`Unknown credit key: ${creditKey}`);
  }
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const current = Number(doc.data()?.credits?.[creditKey] || 0);
    tx.set(ref, { credits: { [creditKey]: current + amount } }, { merge: true });
  });
}

// Atomically checks for and consumes one credit — a transaction, not a
// read-then-write, so two concurrent requests can't both pass a "do I have
// a credit" check against the same single credit (double-spend).
export async function consumeCredit(uid, creditKey) {
  if (!CREDIT_KEYS.includes(creditKey)) {
    throw new Error(`Unknown credit key: ${creditKey}`);
  }
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const current = Number(doc.data()?.credits?.[creditKey] || 0);
    if (current <= 0) return false;
    tx.set(ref, { credits: { [creditKey]: current - 1 } }, { merge: true });
    return true;
  });
}

// Free tier — every non-subscribed user gets 3 full-length Standard
// masters per calendar month at no cost (Professional and stem
// separation are never covered by this, only ever by a credit or the
// subscription). Stored at users/{uid}.freeQuota = { month: "2026-08",
// used: N } — "month" resets the counter the first time a new calendar
// month is seen, no cron job needed to zero it out.
const FREE_MASTERS_PER_MONTH = 3;

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getFreeQuotaStatus(uid) {
  const doc = await userDoc(uid).get();
  const quota = doc.data()?.freeQuota;
  const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
  return { used, remaining: Math.max(0, FREE_MASTERS_PER_MONTH - used), limit: FREE_MASTERS_PER_MONTH };
}

// Same atomic check-and-consume pattern as consumeCredit — a transaction
// so concurrent requests can't both pass a "do I have quota left" check
// against the same remaining slot.
export async function consumeFreeQuota(uid) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const quota = doc.data()?.freeQuota;
    const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
    if (used >= FREE_MASTERS_PER_MONTH) return false;
    tx.set(ref, { freeQuota: { month: currentMonthKey(), used: used + 1 } }, { merge: true });
    return true;
  });
}

// Applies a Polar order.paid webhook event — routes the purchased product
// to the right credit bucket. Ignores orders tied to a subscription
// (recurring invoices also fire order.paid; those are handled by the
// subscription.* events in polarService.js instead) and orders for
// products we don't recognize as one-time credit items.
export async function applyOrderEvent(order) {
  if (order.subscriptionId) return; // a subscription renewal invoice, not a one-time purchase
  const uid = order.customer?.externalId;
  if (!uid) {
    console.warn("Polar order.paid: no externalId on customer, skipping", order.customerId);
    return;
  }
  const creditKey = productToCreditKey()[order.productId];
  if (!creditKey) return; // not one of our known one-time products
  await grantCredit(uid, creditKey, 1);
}
