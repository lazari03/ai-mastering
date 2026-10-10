import * as entitlements from "./entitlementsService.js";

// Reserve-before-render for everything a render spends, and give it back
// when the render doesn't deliver it.
//
// The master slot was moved to this model after concurrent requests from a
// user with one master left all rendered. The stem slot wasn't: it was a
// read before the render and a consume AFTER it whose result was ignored,
// so two simultaneous stem renders with one stem credit both ran Demucs
// (the most expensive job in the app) and the second consume quietly
// returned false. A failed consume (Firestore hiccup) likewise produced an
// unbilled stem job. Both counters now go through the atomic consume
// BEFORE the render, the consume itself being the gate.
//
// `needs` says which counter pays for each part (decided by the route from
// the user's plan and balances): master = "quota" | "credit" | null,
// stem = "quota" | "credit" | null.

export async function reserveRenderSlots({ uid, plan, quotaLimit, needs }, ent = entitlements) {
  const reserved = { master: null, stem: null };
  if (needs.master === "quota") reserved.master = (await ent.consumeMasterQuota(uid, quotaLimit, plan).catch(() => false)) ? "quota" : null;
  else if (needs.master === "credit") reserved.master = (await ent.consumeExtraCredit(uid).catch(() => false)) ? "credit" : null;
  if (needs.master && !reserved.master) return { ok: false, failed: "master", reserved };

  if (needs.stem === "quota") reserved.stem = (await ent.consumeStemQuota(uid).catch(() => false)) ? "quota" : null;
  else if (needs.stem === "credit") reserved.stem = (await ent.consumeExtraStemCredit(uid).catch(() => false)) ? "credit" : null;
  if (needs.stem && !reserved.stem) {
    // All or nothing: a render that can't have its stems must not keep
    // the master slot it just took.
    await releaseRenderSlots({ uid, plan, reserved, parts: ["master"] }, ent);
    return { ok: false, failed: "stem", reserved: { master: null, stem: null } };
  }
  return { ok: true, reserved };
}

// Gives back the reserved parts named in `parts`. Never throws: a failed
// refund is logged for manual correction instead of masking the real
// reason the render failed. Returns the parts that could not be refunded.
export async function releaseRenderSlots({ uid, plan, reserved, parts = ["master", "stem"] }, ent = entitlements) {
  const lost = [];
  const refunds = {
    master: { quota: () => ent.refundMasterQuota(uid, plan), credit: () => ent.refundExtraCredit(uid) },
    stem: { quota: () => ent.refundStemQuota(uid), credit: () => ent.refundExtraStemCredit(uid) },
  };
  for (const part of parts) {
    const kind = reserved?.[part];
    if (!kind) continue;
    try {
      await refunds[part][kind]();
      reserved[part] = null;
    } catch (error) {
      lost.push(part);
      console.error(`Failed to refund the ${part} ${kind} for uid ${uid} — slot lost, needs manual correction:`, error.message);
    }
  }
  return lost;
}
