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
// Keyed by internal plan key, not by Polar product — the monthly and
// annual variants of a plan are two Polar products but one entitlement
// level, so both resolve to the same key before reaching this map.
export const PLAN_MASTER_LIMITS = { free: 3, indie: 15, studio: 50, pro: 250 };

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

// ---- Generic building blocks ------------------------------------------
// Every "N free forever, then buy more" entitlement in this app (master
// trial, chord trial, and both their credit top-ups) is the same two
// shapes underneath: a lifetime counter that never resets, and a credit
// balance that only ever goes up via a webhook and down via usage. One
// implementation of each, thin named wrappers below for call-site clarity
// and so a typo'd field name can't silently read/write the wrong counter.

async function getLifetimeUsed(uid, field) {
  const doc = await userDoc(uid).get();
  return Number(doc.data()?.[field]?.used || 0);
}

// Atomically checks for and consumes one slot — a transaction, not a
// read-then-write, so two concurrent requests can't both pass a "do I
// have quota left" check against the same last remaining slot.
async function consumeLifetime(uid, field, limit) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const used = Number(doc.data()?.[field]?.used || 0);
    if (used >= limit) return false;
    tx.set(ref, { [field]: { used: used + 1 } }, { merge: true });
    return true;
  });
}

// Same shape as getLifetimeUsed/consumeLifetime but month-keyed instead
// of forever — used for the stem-separation sub-quota below. The master
// quota's Studio/All-Access branch has its own near-identical inline
// transaction (predates this helper) rather than being refactored onto
// it, deliberately, to avoid touching already-verified code for a
// same-behavior rename.
async function getMonthlyUsed(uid, field) {
  const doc = await userDoc(uid).get();
  const quota = doc.data()?.[field];
  return quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
}

async function consumeMonthly(uid, field, limit) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const quota = doc.data()?.[field];
    const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
    if (used >= limit) return false;
    tx.set(ref, { [field]: { month: currentMonthKey(), used: used + 1 } }, { merge: true });
    return true;
  });
}

async function getCreditBalance(uid, field) {
  const doc = await userDoc(uid).get();
  return Number(doc.data()?.[field] || 0);
}

async function consumeCredit(uid, field) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const doc = await tx.get(ref);
    const credits = Number(doc.data()?.[field] || 0);
    if (credits <= 0) return false;
    tx.set(ref, { [field]: credits - 1 }, { merge: true });
    return true;
  });
}

// ---- Master quota (Free lifetime trial + Studio/All-Access monthly) ---

export async function getMasterQuotaStatus(uid, plan) {
  const limit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;
  if (plan === "free") {
    const used = await getLifetimeUsed(uid, "freeMasterUsage");
    return { used, remaining: Math.max(0, limit - used), limit, resets: false };
  }
  const doc = await userDoc(uid).get();
  const quota = doc.data()?.masterQuota;
  const used = quota?.month === currentMonthKey() ? Number(quota.used || 0) : 0;
  return { used, remaining: Math.max(0, limit - used), limit, resets: true };
}

// plan decides which counter this actually spends: Free's lifetime
// freeMasterUsage, or everyone else's month-keyed masterQuota (which
// isn't a simple lifetime counter, so it keeps its own small
// transaction here rather than going through consumeLifetime()).
export async function consumeMasterQuota(uid, limit, plan) {
  if (plan === "free") return consumeLifetime(uid, "freeMasterUsage", limit);
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

// ---- Single Master credits (one-time top-up, any plan) -----------------
// A one-time-purchase top-up ("pay for just this one track") sitting
// *next to* the monthly plan quota, not instead of it. See
// polarService.js's order.paid webhook handling and masteringRoutes.js's
// /master route (falls back to a credit only after the quota is
// actually exhausted, never before).
export const getExtraCreditCount = (uid) => getCreditBalance(uid, "extraMasterCredits");
export const consumeExtraCredit = (uid) => consumeCredit(uid, "extraMasterCredits");

// Chord detection used to be gated here (a lifetime trial + pay-per-song
// credits, same shape as masters) but is now unconditionally free — see
// masteringRoutes.js's /analyze-chords. No quota/credit functions needed.

// ---- Stem separation (All-Access: bounded monthly sub-quota + credits; -
// ---- Free/Studio: credits only, no bundled access at all) -------------
// Real, disproportionate server cost compared to a plain master — Demucs
// source separation is heavy compute, and the job renders multiple output
// files (one per stem) instead of one. Unlike the master quota,
// All-Access does NOT get "unlimited within your 250 masters" for
// stems — it gets its own smaller monthly sub-limit, so a heavy stem
// user can't quietly consume a disproportionate share of server capacity
// just because their overall master count hasn't run out. Free/Studio
// get no bundled stem access at all (no free trial either, deliberately —
// this is the single most expensive operation in the app) — a purchased
// credit is the only way in for them. See masteringRoutes.js's /master
// gating and PRICING.md.
export const STEM_MONTHLY_LIMIT = 20;

export async function getStemQuotaStatus(uid) {
  const used = await getMonthlyUsed(uid, "stemQuota");
  return { used, remaining: Math.max(0, STEM_MONTHLY_LIMIT - used), limit: STEM_MONTHLY_LIMIT, resets: true };
}
export const consumeStemQuota = (uid) => consumeMonthly(uid, "stemQuota", STEM_MONTHLY_LIMIT);
export const getExtraStemCreditCount = (uid) => getCreditBalance(uid, "extraStemCredits");
export const consumeExtraStemCredit = (uid) => consumeCredit(uid, "extraStemCredits");

// ---- Single-read snapshot --------------------------------------------
// Everything the entitlements endpoint and /master's pre-render checks
// need lives on the one users/{uid} document. Reading it once and deriving
// every counter from the snapshot replaces 4-6 separate reads of the same
// doc per call. Consumption still goes through the transactional helpers
// above (they must re-read inside the transaction to be race-safe).
export async function readUserData(uid) {
  const doc = await userDoc(uid).get();
  return doc.data() || {};
}

export function entitlementsFromUserData(data, plan) {
  const month = currentMonthKey();
  const limit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;
  let masterQuota;
  if (plan === "free") {
    const used = Number(data?.freeMasterUsage?.used || 0);
    masterQuota = { used, remaining: Math.max(0, limit - used), limit, resets: false };
  } else {
    const q = data?.masterQuota;
    const used = q?.month === month ? Number(q.used || 0) : 0;
    masterQuota = { used, remaining: Math.max(0, limit - used), limit, resets: true };
  }
  const sq = data?.stemQuota;
  const stemUsed = sq?.month === month ? Number(sq.used || 0) : 0;
  return {
    masterQuota,
    extraCredits: Number(data?.extraMasterCredits || 0),
    stemQuota: { used: stemUsed, remaining: Math.max(0, STEM_MONTHLY_LIMIT - stemUsed), limit: STEM_MONTHLY_LIMIT, resets: true },
    extraStemCredits: Number(data?.extraStemCredits || 0),
  };
}
