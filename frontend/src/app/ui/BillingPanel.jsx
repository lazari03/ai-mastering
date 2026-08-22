"use client";

import { useState } from "react";

import { postCheckout, postChangePlan, postBillingPortal } from "@/network/http/client";
import { PLANS, PLAN_ORDER, SINGLE_MASTER } from "@/lib/pricing";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { trackEvent } from "@/lib/analytics";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";

export default function BillingPanel() {
  const { plan: currentPlan, masterQuota, extraCredits, loaded, refresh } = useEntitlementsStore();
  const [busyItem, setBusyItem] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [changeStatus, setChangeStatus] = useState("");

  // planKey/price are threaded through the success URL so /thank-you can
  // fire a real GA4 "purchase" event — Polar doesn't hand the amount back
  // on redirect, this is what the user actually clicked to buy. It's an
  // approximation, not a server-confirmed transaction (see analytics
  // notes) until a GA4 Measurement Protocol API secret is wired up
  // server-side against the real Polar webhook payload.
  //
  // Already on a paid plan -> change-plan (modifies the existing
  // subscription in place, Polar handles proration). Currently free ->
  // checkout (nothing exists yet to modify). Using checkout for an
  // already-subscribed user used to create a second, independent
  // subscription instead of replacing the first — see
  // changeSubscriptionPlan in polarService.js.
  const buy = async (item, planKey, priceLabel) => {
    setBusyItem(item);
    setCheckoutError("");
    setChangeStatus("");
    trackEvent("begin_checkout", { currency: "EUR", value: Number(String(priceLabel).replace(/[^\d.]/g, "")) || 0, items: [{ item_id: item, item_name: planKey }] });
    try {
      if (currentPlan && currentPlan !== "free") {
        const { immediate } = await postChangePlan(item);
        await refresh();
        setBusyItem("");
        const planLabel = planKey === "pro" ? "All-Access" : "Studio";
        setChangeStatus(
          immediate
            ? `Switched to ${planLabel} — charged the prorated difference now.`
            : `Scheduled: you'll move to ${planLabel} at the start of your next billing period, no charge yet.`
        );
        return;
      }
      const successUrl = `${window.location.origin}/thank-you?plan=${encodeURIComponent(planKey)}&item=${encodeURIComponent(item)}&price=${encodeURIComponent(priceLabel)}`;
      const { url } = await postCheckout(item, successUrl);
      window.location.href = url;
    } catch (err) {
      setBusyItem("");
      setCheckoutError(err?.message || "Failed to start checkout.");
    }
  };

  // Always a real one-time checkout, never plan-change — this is
  // additive on top of whatever plan someone's already on, not a switch,
  // so it must never route through postChangePlan (which modifies the
  // existing subscription's product, not what a one-time purchase means).
  const buySingleMaster = async () => {
    setBusyItem(SINGLE_MASTER.item);
    setCheckoutError("");
    setChangeStatus("");
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(SINGLE_MASTER.price).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: SINGLE_MASTER.item, item_name: "single_master" }],
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=single_master&item=${encodeURIComponent(SINGLE_MASTER.item)}&price=${encodeURIComponent(SINGLE_MASTER.price)}`;
      const { url } = await postCheckout(SINGLE_MASTER.item, successUrl);
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
        <LoadingBlock />
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
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-brass/50 bg-brass/[0.18] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                    >
                      {busyItem === "portal" ? (
                        <>
                          <Spinner size={12} /> Redirecting…
                        </>
                      ) : (
                        "Manage billing"
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => buy(plan.item, plan.key, plan.price)}
                      disabled={Boolean(busyItem)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
                    >
                      {busyItem === plan.item ? (
                        <>
                          <Spinner size={12} /> {currentPlan !== "free" ? "Updating…" : "Redirecting…"}
                        </>
                      ) : isUpgrade ? (
                        "Upgrade"
                      ) : (
                        "Switch"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {masterQuota ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">{masterQuota.resets ? "Masters this month" : "Free trial masters"}</p>
              <p className="m-0 text-xs text-zinc-500">
                {masterQuota.remaining} of {masterQuota.limit} left
                {masterQuota.resets ? " · resets next month" : " · one-time, doesn't renew"}
                {extraCredits > 0 ? ` · +${extraCredits} single-master credit${extraCredits === 1 ? "" : "s"} on top` : ""}
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 p-3">
            <div>
              <p className="m-0 text-sm text-white">
                {SINGLE_MASTER.label} — {SINGLE_MASTER.price}
              </p>
              <p className="m-0 mt-0.5 text-xs text-zinc-500">
                {SINGLE_MASTER.blurb} No subscription — just this one track.
              </p>
            </div>
            <button
              type="button"
              onClick={buySingleMaster}
              disabled={Boolean(busyItem)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
            >
              {busyItem === SINGLE_MASTER.item ? (
                <>
                  <Spinner size={12} /> Redirecting…
                </>
              ) : (
                "Buy one"
              )}
            </button>
          </div>
        </>
      )}
      {changeStatus ? <p className="mt-3 text-sm text-brass">{changeStatus}</p> : null}
      {checkoutError ? <p className="mt-3 text-sm text-red-300">{checkoutError}</p> : null}
    </div>
  );
}
