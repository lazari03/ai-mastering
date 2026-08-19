import { create } from "zustand";

import { getEntitlements } from "@/network/http/client";

// The single source of truth for "what is this user allowed to do" —
// every button that needs to know (Master Track, Professional engine,
// stem separation, chord detection, Share) reads from here instead of
// each component fetching and caching its own copy. That duplication is
// exactly what used to cause "I paid, but this other button still asks me
// for money" — one component's local fetch would go stale while another's
// had already refreshed, and there was no single moment where "the user
// just paid" invalidated all of them at once. refresh() is that moment now.
export const useEntitlementsStore = create((set, get) => ({
  plan: "free",
  subscription: null,
  masterQuota: null,
  loading: true,
  loaded: false,

  async fetch() {
    try {
      const data = await getEntitlements();
      set({
        plan: data.plan || "free",
        subscription: data.subscription || null,
        masterQuota: data.masterQuota || null,
        loading: false,
        loaded: true,
      });
    } catch {
      // Not signed in yet, or a transient network error — stay on the
      // safe default (Free, nothing unlocked) rather than crash. The next
      // refresh() (tab switch, post-checkout return, etc.) tries again.
      set({ loading: false, loaded: true });
    }
  },

  // Call after anything that could change entitlements: a completed
  // checkout, returning to the app tab, a successful master (quota moved).
  async refresh() {
    return get().fetch();
  },
}));

// Derived, not stored — always computed fresh from plan so there's no way
// for these to drift out of sync with the plan value itself.
export function planUnlocksProAndStems(plan) {
  return plan === "studio" || plan === "pro";
}

export function planUnlocksChordsAndShare(plan) {
  return plan === "pro";
}
