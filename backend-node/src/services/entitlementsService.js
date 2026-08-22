import { getFirestore } from "../config/firebase.js";

// Master quota — Studio/All-Access get a generous but bounded number of
// full-length masters per calendar month (resets automatically). Free is
// different on purpose: 3 masters, ONE TIME — a trial for a first-time
// user, not a recurring monthly allowance. Once a Free user spends
// those 3, there is no next-month reset for them; their path forward is
// a single-master purchase (see extra-credit functions below) or
// upgrading to a paid plan. This is what "pay-per-master is the standard
// path for Free users past their trial" means in practice — the
// resets:true/false flag on the returned status is what the frontend
// uses to decide whether to say "resets next month" at all. See
// PRICING.md.
export const PLAN_MASTER_LIMITS = { free: 3, studio: 50, pro: 250 };

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

export async function getMasterQuotaStatus(uid, plan) {
  const limit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;
  const doc = await userDoc(uid).get();
  const data = doc.data() || {};

  if (plan === "free") {
    // Lifetime counter, not month-keyed — deliberately never resets.
    const used = Number(data.freeMasterUsage?.used || 0);
    return { used, remaining: Math.max(0, limit - used), limit, resets: false };
  }

  const quota = data.masterQuota;
  const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
  return { used, remaining: Math.max(0, limit - used), limit, resets: true };
}

// Atomically checks for and consumes one slot — a transaction, not a
// read-then-write, so two concurrent renders can't both pass a "do I have
// quota left" check against the same last remaining slot. limit is passed
// in (not re-derived from a fresh plan lookup) so the check inside the
// transaction matches exactly what the caller already validated against.
// plan decides which counter this actually spends: Free's lifetime
// freeMasterUsage, or everyone else's month-keyed masterQuota.
export async function consumeMasterQuota(uid, limit, plan) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const data = doc.data() || {};

    if (plan === "free") {
      const used = Number(data.freeMasterUsage?.used || 0);
      if (used >= limit) return false;
      tx.set(ref, { freeMasterUsage: { used: used + 1 } }, { merge: true });
      return true;
    }

    const quota = data.masterQuota;
    const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
    if (used >= limit) return false;
    tx.set(ref, { masterQuota: { month: currentMonthKey(), used: used + 1 } }, { merge: true });
    return true;
  });
}

// Extra master credits — a one-time-purchase top-up ("pay for just this
// one track") sitting *next to* the monthly plan quota, not instead of
// it. Exists for exactly the case a subscription doesn't fit: someone who
// masters a handful of times a year, hits their monthly limit once, and
// doesn't want a recurring commitment for one more render. See
// polarService.js's order.paid webhook handling (grantExtraCredits) and
// masteringRoutes.js's /master route (falls back to a credit only after
// the monthly quota is actually exhausted, never before).
export async function getExtraCreditCount(uid) {
  const doc = await userDoc(uid).get();
  return Number(doc.data()?.extraMasterCredits || 0);
}

// Same atomic-transaction discipline as consumeMasterQuota — never a
// read-then-write, so two concurrent renders can't both spend the same
// last credit.
export async function consumeExtraCredit(uid) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const credits = Number(doc.data()?.extraMasterCredits || 0);
    if (credits <= 0) return false;
    tx.set(ref, { extraMasterCredits: credits - 1 }, { merge: true });
    return true;
  });
}

// Called from the order.paid webhook once a one-time purchase actually
// completes — never from anything client-triggered, same reasoning as
// every other entitlement in this app (server/webhook is the only thing
// that grants access, the client only ever asks for its current status).
export async function grantExtraCredits(uid, count = 1) {
  const db = getFirestore();
  const ref = userDoc(uid);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const credits = Number(doc.data()?.extraMasterCredits || 0);
    tx.set(ref, { extraMasterCredits: credits + count }, { merge: true });
  });
}
