"use client";

import { useEntitlementsStore } from "@/store/entitlementsStore";
import { PLANS } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";

// Persistent, always-visible plan/quota indicator — deliberately not
// tucked inside a button's label (that's what caused the "why does this
// button say something different than that one" confusion before). Reads
// from the same centralized store every entitlement-gated button reads
// from, so this badge and every button always agree.
//
// Lives inline in the app shell's own nav chrome (the mobile top bar and
// the desktop sidebar header, see AppClient.jsx) rather than as a fixed
// overlay — a `fixed` position badge sat on top of every screen's content
// regardless of what was underneath it, which is exactly the "floating
// over everything" behavior this was moved to fix. `compact` drops the
// quota fraction for the mobile top bar, where there isn't room for it
// next to the logo and the menu button.
export default function EntitlementsBadge({ onClick, compact = false, className = "" }) {
  const { t } = useLanguage();
  const { plan, masterQuota, loaded } = useEntitlementsStore();
  if (!loaded) return null;

  const label = PLANS[plan]?.label || "Free";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-brass/40 ${className}`}
    >
      <span className={plan === "free" ? "text-zinc-400" : "text-brass"}>{label}</span>
      {!compact && masterQuota ? (
        <span className="text-zinc-500">
          · {masterQuota.remaining}/{masterQuota.limit} {t("badge.masters")}
        </span>
      ) : null}
    </button>
  );
}
