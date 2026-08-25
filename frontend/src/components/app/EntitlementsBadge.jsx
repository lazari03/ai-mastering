"use client";

import { useEntitlementsStore } from "@/store/entitlementsStore";
import { PLANS } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";

// Persistent, always-visible plan/quota indicator — top-right corner on
// every screen size, deliberately not tucked inside a button's label
// (that's what caused the "why does this button say something different
// than that one" confusion before). Reads from the same centralized store
// every entitlement-gated button reads from, so this badge and every
// button always agree.
export default function EntitlementsBadge({ onClick }) {
  const { t } = useLanguage();
  const { plan, masterQuota, loaded } = useEntitlementsStore();
  if (!loaded) return null;

  const label = PLANS[plan]?.label || "Free";

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-3 top-16 z-40 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 backdrop-blur-md transition hover:border-brass/40 sm:right-5 sm:top-5"
    >
      <span className={plan === "free" ? "text-zinc-400" : "text-brass"}>{label}</span>
      {masterQuota ? (
        <span className="text-zinc-500">
          · {masterQuota.remaining}/{masterQuota.limit} {t("badge.masters")}
        </span>
      ) : null}
    </button>
  );
}
