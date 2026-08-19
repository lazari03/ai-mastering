import { getFirestore } from "../config/firebase.js";

// Monthly mastering quota — every plan (see polarService.js's getPlan())
// gets a generous but bounded number of full-length masters per calendar
// month, not "unlimited." Professional tier and stem separation are
// additionally gated to Studio/Pro by plan alone (see masteringRoutes.js);
// this quota is what actually caps volume once someone's on a paid plan,
// so a single €9.99/mo account can't render thousands of masters a month.
// All-Access is 5x Studio, matching what "the full toolkit" should feel
// like relative to the mid tier. See PRICING.md.
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
  const quota = doc.data()?.masterQuota;
  const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
  return { used, remaining: Math.max(0, limit - used), limit };
}

// Atomically checks for and consumes one slot — a transaction, not a
// read-then-write, so two concurrent renders can't both pass a "do I have
// quota left" check against the same last remaining slot. limit is passed
// in (not re-derived from a fresh plan lookup) so the check inside the
// transaction matches exactly what the caller already validated against.
export async function consumeMasterQuota(uid, limit) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const quota = doc.data()?.masterQuota;
    const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
    if (used >= limit) return false;
    tx.set(ref, { masterQuota: { month: currentMonthKey(), used: used + 1 } }, { merge: true });
    return true;
  });
}
