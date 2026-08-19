"use client";

import { useEffect, useState } from "react";

import { getEntitlements, postCheckout, postBillingPortal } from "@/network/http/client";
import { PRICING } from "@/lib/pricing";

const CREDIT_ITEMS = [
  { key: "masterStandard", ...PRICING.masterStandard },
  { key: "masterProfessional", ...PRICING.masterProfessional },
  { key: "chords", ...PRICING.chords },
  { key: "stemAddon", ...PRICING.stemAddon },
];

export default function BillingPanel() {
  const [entitlements, setEntitlements] = useState(null);
  const [busyItem, setBusyItem] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    getEntitlements()
      .then(setEntitlements)
      .catch(() => setEntitlements({ subscription: { active: false }, credits: {} }));
  }, []);

  const buy = async (item) => {
    setBusyItem(item);
    setCheckoutError("");
    try {
      const { url } = await postCheckout(item, `${window.location.origin}/thank-you`);
      window.location.href = url;
    } catch (err) {
      setBusyItem("");
      setCheckoutError(err?.message || "Failed to start checkout.");
    }
  };

  const openPortal = async () => {
    setBusyItem("portal");
    setCheckoutError("");
    try {
      const { url } = await postBillingPortal();
      window.location.href = url;
    } catch (err) {
      setBusyItem("");
      setCheckoutError(err?.message || "Failed to open billing portal.");
    }
  };

  const subscribed = entitlements?.subscription?.active;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Billing</h2>

      {entitlements === null ? (
        <p className="mt-2 text-xs text-zinc-400">Loading…</p>
      ) : (
        <>
          {/* All-Access subscription */}
          <div className="mt-3 rounded-xl border border-brass/25 bg-brass/[0.06] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="m-0 text-sm font-semibold text-white">
                  {PRICING.subscription.label} — <span className="text-brass">{PRICING.subscription.price}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-400">{PRICING.subscription.blurb}</p>
              </div>
              {subscribed ? (
                <span className="shrink-0 rounded-full border border-brass/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-brass">
                  Active
                </span>
              ) : null}
            </div>
            {subscribed ? (
              entitlements.subscription.currentPeriodEnd ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Renews {new Date(entitlements.subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              ) : null
            ) : null}
            <button
              type="button"
              onClick={() => (subscribed ? openPortal() : buy("subscription"))}
              disabled={Boolean(busyItem)}
              className="mt-3 rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-brass hover:bg-brass/25 disabled:opacity-50"
            >
              {busyItem === (subscribed ? "portal" : "subscription")
                ? "Redirecting…"
                : subscribed
                  ? "Manage billing"
                  : "Subscribe"}
            </button>
          </div>

          {/* Free monthly quota — 3 Standard masters, resets calendar-monthly */}
          {!subscribed && entitlements.freeQuota ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">Free Standard masters this month</p>
              <p className="m-0 text-xs text-zinc-500">
                {entitlements.freeQuota.remaining} of {entitlements.freeQuota.limit} left · resets next month
              </p>
            </div>
          ) : null}

          {/* Pay-per-use credits */}
          <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.1em] text-zinc-500">
            {subscribed ? "Covered by your subscription" : "Or buy what you need, no subscription"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CREDIT_ITEMS.map((item) => {
              const balance = entitlements.credits?.[item.key] || 0;
              return (
                <div key={item.key} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm text-white">{item.label}</p>
                    <p className="m-0 text-xs text-zinc-500">
                      {item.price} {balance > 0 ? `· ${balance} owned` : ""}
                    </p>
                  </div>
                  {!subscribed ? (
                    <button
                      type="button"
                      onClick={() => buy(item.item)}
                      disabled={Boolean(busyItem)}
                      className="shrink-0 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30 disabled:opacity-50"
                    >
                      {busyItem === item.item ? "…" : "Buy"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
      {checkoutError ? <p className="mt-3 text-sm text-red-300">{checkoutError}</p> : null}
    </div>
  );
}
