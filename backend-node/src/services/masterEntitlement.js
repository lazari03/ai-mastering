import { PLAN_MASTER_LIMITS, STEM_MONTHLY_LIMIT } from "./entitlementsService.js";

// The pre-render billing decision for a full (non-preview) master, shared by
// POST /master and the ChatGPT MCP integration (src/mcp/) so both channels
// enforce exactly the same plan rules. Pure: it reads an already-taken
// entitlements snapshot and decides WHICH counter a render would spend. The
// authoritative gate is still ledger.reserve() (reservationLedger.js), which
// re-reads the user document inside a transaction — this only decides what
// to ask it for, and refuses early with a clear message when nothing is left.
//
// Fails CLOSED: a null snapshot (unreadable user doc) reads as "nothing
// available", never as "quota available".
//
// Returns { ok: true, quotaLimit, needs: { master, stem } } where each need
// is "quota" | "credit" | null, or { ok: false, status, code, detail }.
// `code` is a stable machine-readable reason; POST /master keeps answering
// with { detail } only, exactly as before this was extracted.
export function decideMasterCharge({ plan, snapshot, tier = "standard", useStemSeparation = false }) {
  const planUnlocked = plan === "studio" || plan === "pro";
  const quotaLimit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;

  if (tier === "professional" && !planUnlocked) {
    return {
      ok: false,
      status: 402,
      code: "plan_required",
      detail: "Professional mastering needs the Studio plan or higher. See plans in Settings → Billing.",
    };
  }

  let stem = null;
  if (useStemSeparation) {
    if (plan === "pro") {
      const stemQuota = snapshot ? snapshot.stemQuota : { remaining: 0, limit: STEM_MONTHLY_LIMIT };
      if (stemQuota.remaining > 0) {
        stem = "quota";
      } else if ((snapshot ? snapshot.extraStemCredits : 0) > 0) {
        stem = "credit";
      } else {
        return {
          ok: false,
          status: 402,
          code: "stem_quota_exhausted",
          detail: `You've used your ${stemQuota.limit} stem separations this month — they reset next month. Buy an extra one if you don't want to wait. Manage in Settings → Billing.`,
        };
      }
    } else if ((snapshot ? snapshot.extraStemCredits : 0) > 0) {
      stem = "credit";
    } else {
      return {
        ok: false,
        status: 402,
        code: "stem_not_included",
        detail: "Stem separation is included on All-Access (20/month), or buy a single stem-separated master. Manage in Settings → Billing.",
      };
    }
  }

  const quota = snapshot ? snapshot.masterQuota : { remaining: 0, limit: quotaLimit };
  let master;
  if (quota.remaining > 0) {
    master = "quota";
  } else if ((snapshot ? snapshot.extraCredits : 0) > 0) {
    master = "credit";
  } else if (plan === "free") {
    return {
      ok: false,
      status: 402,
      code: "quota_exhausted",
      detail: `You've used your ${quotaLimit} free masters — that's a one-time trial, it doesn't renew. Buy a single master for just this track, or subscribe — Indie (15/month), Studio (50/month) or All-Access (250/month) — in Settings → Billing.`,
    };
  } else {
    const upsellPlan = plan === "indie" ? "Studio for 50/month" : plan === "studio" ? "All-Access for 250/month" : null;
    const upsell = upsellPlan ? ` Upgrade to ${upsellPlan}, or` : " Or";
    return {
      ok: false,
      status: 402,
      code: "quota_exhausted",
      detail: `You've used your ${quotaLimit} masters this month — they reset next month.${upsell} buy a single master if you don't want to wait. Manage in Settings → Billing.`,
    };
  }

  return { ok: true, quotaLimit, needs: { master, stem } };
}
