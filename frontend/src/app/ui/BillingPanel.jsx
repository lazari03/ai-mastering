"use client";

import { useState } from "react";

import { postCheckout, postBillingPortal } from "@/network/http/client";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { useEntitlementsStore } from "@/store/entitlementsStore";

export default function BillingPanel() {
  const { plan: currentPlan, masterQuota, loaded } = useEntitlementsStore();
  const [busyItem, setBusyItem] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

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

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h2 className="m-0 text-xs uppercase tracking-[0.14em] text-brass">Billing</h2>

      {!loaded ? (
        <p className="mt-2 text-xs text-zinc-400">Loading…</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const isCurrent = currentPlan === key;
              const isUpgrade = PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan);
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-4 ${isCurrent ? "border-brass/50 bg-brass/[0.06]" : "border-white/10 bg-black/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-white">{plan.label}</p>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full border border-brass/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-brass">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 text-lg font-bold text-white">
                    {plan.price}
                    <span className="text-xs font-normal text-zinc-500">{plan.period}</span>
                  </p>
                  <ul className="m-0 mt-2 flex flex-col gap-1 pl-4 text-xs text-zinc-400">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>

                  {key === "free" ? null : isCurrent ? (
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={Boolean(busyItem)}
                      className="mt-3 w-full rounded-full border border-brass/50 bg-brass/[0.18] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                    >
                      {busyItem === "portal" ? "Redirecting…" : "Manage billing"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => buy(plan.item)}
                      disabled={Boolean(busyItem)}
                      className="mt-3 w-full rounded-full border border-white/15 bg-black/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
                    >
                      {busyItem === plan.item ? "Redirecting…" : isUpgrade ? "Upgrade" : "Switch"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {masterQuota ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">Masters this month</p>
              <p className="m-0 text-xs text-zinc-500">
                {masterQuota.remaining} of {masterQuota.limit} left · resets next month
              </p>
            </div>
          ) : null}
        </>
      )}
      {checkoutError ? <p className="mt-3 text-sm text-red-300">{checkoutError}</p> : null}
    </div>
  );
}
