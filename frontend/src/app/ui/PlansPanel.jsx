"use client";

import { useState } from "react";

import { postCheckout, postChangePlan, postBillingPortal } from "@/network/http/client";
import { PLANS, PLAN_ORDER, SINGLE_MASTER, CHORD_DETECTION, CHORDS_MONTHLY, STEM_SEPARATION } from "@/lib/pricing";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { trackEvent } from "@/lib/analytics";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import { IconCheck } from "@/components/app/icons";

// Feature-by-feature comparison rows — Free/Studio/All-Access columns,
// in PLAN_ORDER. "—" means not included, everything else is the actual
// value for that plan. Hand-written rather than derived from PLANS'
// prose `features` arrays since those are marketing bullet points (not
// every plan lists every axis, and the wording differs), while a
// comparison table needs one consistent row per axis across all three.
const COMPARISON_ROWS = [
  { label: "Masters", values: ["3 total (one-time)", "50 / month", "250 / month"] },
  { label: "Standard engine", values: [true, true, true] },
  { label: "Professional engine", values: [false, true, true] },
  { label: "Stem separation", values: ["Pay per use", "Pay per use", "20 / month included"] },
  { label: "Chord detection", values: ["3 free, then pay", "3 free, then pay", "Unlimited"] },
  { label: "Shareable download links", values: [false, false, true] },
];

/**
 * The dedicated in-app Plans page — a real comparison table plus the
 * existing plan cards / one-time add-ons, all in one place with its own
 * sidebar tab (?tab=plans) instead of being buried inside Settings. Two
 * reasons that split matters: it's a distinct, trackable page_view in
 * analytics (Settings visits and pricing-consideration visits are very
 * different funnel signals), and every "upgrade"/quota-exceeded prompt
 * elsewhere in the app can now link straight here instead of to a vague
 * "Settings" tab.
 */
export default function PlansPanel() {
  const { t } = useLanguage();
  const {
    plan: currentPlan,
    masterQuota,
    extraCredits,
    chordQuota,
    extraChordCredits,
    chordSubscriptionActive,
    stemQuota,
    extraStemCredits,
    loaded,
    refresh,
  } = useEntitlementsStore();
  const [busyItem, setBusyItem] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [changeStatus, setChangeStatus] = useState("");

  // planKey/price are threaded through the success URL so /thank-you can
  // fire a client-side GA4 "purchase" event as a fallback — the real,
  // reliable copy of that event now fires server-side from the Polar
  // order.paid webhook (see polarService.js), immune to ad-blockers and
  // closed tabs during redirect.
  //
  // Already on a paid plan -> change-plan (modifies the existing
  // subscription in place, Polar handles proration). Currently free ->
  // checkout (nothing exists yet to modify).
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
        setChangeStatus(immediate ? t("billing.switchedTo", { plan: planLabel }) : t("billing.scheduledTo", { plan: planLabel }));
        return;
      }
      const successUrl = `${window.location.origin}/thank-you?plan=${encodeURIComponent(planKey)}&item=${encodeURIComponent(item)}&price=${encodeURIComponent(priceLabel)}`;
      const { url } = await postCheckout(item, successUrl);
      window.location.href = url;
    } catch (err) {
      setBusyItem("");
      setCheckoutError(err?.message || t("billing.checkoutFailed"));
    }
  };

  // Always a real checkout, never plan-change — additive on top of
  // whatever plan someone's already on, not a switch.
  const buyOneTime = async (product, planLabel) => {
    setBusyItem(product.item);
    setCheckoutError("");
    setChangeStatus("");
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(product.price).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: product.item, item_name: planLabel }],
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=${planLabel}&item=${encodeURIComponent(product.item)}&price=${encodeURIComponent(product.price)}`;
      const { url } = await postCheckout(product.item, successUrl);
      window.location.href = url;
    } catch (err) {
      setBusyItem("");
      setCheckoutError(err?.message || t("billing.checkoutFailed"));
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
      setCheckoutError(err?.message || t("billing.portalFailed"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">{t("billing.title")}</h1>
      <p className="mt-2 text-sm text-zinc-400">{t("plans.subtitle")}</p>

      {!loaded ? (
        <LoadingBlock />
      ) : (
        <>
          {/* Plan cards */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
                        {t("billing.current")}
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
                          <Spinner size={12} /> {t("billing.redirecting")}
                        </>
                      ) : (
                        t("billing.manage")
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
                          <Spinner size={12} /> {currentPlan !== "free" ? t("billing.updating") : t("billing.redirecting")}
                        </>
                      ) : isUpgrade ? (
                        t("billing.upgrade")
                      ) : (
                        t("billing.switch")
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Feature comparison table */}
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-black/30">
                  <th className="p-3 text-left text-xs uppercase tracking-[0.1em] text-zinc-400">{t("plans.feature")}</th>
                  {PLAN_ORDER.map((key) => (
                    <th key={key} className="p-3 text-left text-xs uppercase tracking-[0.1em] text-zinc-300">
                      {PLANS[key].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-white/5 last:border-0">
                    <td className="p-3 text-zinc-300">{row.label}</td>
                    {row.values.map((value, i) => (
                      <td key={PLAN_ORDER[i]} className="p-3 text-zinc-400">
                        {value === true ? (
                          <IconCheck className="text-brass" />
                        ) : value === false ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          value
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {masterQuota ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">{masterQuota.resets ? t("billing.mastersThisMonth") : t("billing.freeTrialMasters")}</p>
              <p className="m-0 text-xs text-zinc-500">
                {t("billing.leftOf", { remaining: masterQuota.remaining, limit: masterQuota.limit })}
                {" · "}
                {masterQuota.resets ? t("billing.resetsNextMonth") : t("billing.oneTimeNoRenew")}
                {extraCredits > 0 ? ` · ${t("billing.plusCreditsMaster", { n: extraCredits, s: extraCredits === 1 ? "" : "s" })}` : ""}
              </p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 p-3">
              <div className="min-w-0">
                <p className="m-0 text-sm text-white">
                  {SINGLE_MASTER.label} — {SINGLE_MASTER.price}
                </p>
                <p className="m-0 mt-0.5 text-xs text-zinc-500">
                  {SINGLE_MASTER.blurb} {t("billing.noSubNote")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => buyOneTime(SINGLE_MASTER, "single_master")}
                disabled={Boolean(busyItem)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
              >
                {busyItem === SINGLE_MASTER.item ? (
                  <>
                    <Spinner size={12} /> {t("billing.redirecting")}
                  </>
                ) : (
                  t("billing.buyOne")
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 p-3">
              <div className="min-w-0">
                <p className="m-0 text-sm text-white">
                  {STEM_SEPARATION.label} — {STEM_SEPARATION.price}
                </p>
                <p className="m-0 mt-0.5 text-xs text-zinc-500">
                  {currentPlan === "pro" ? t("billing.stemNoteAllAccess") : `${STEM_SEPARATION.blurb} ${t("billing.stemNoteOther")}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => buyOneTime(STEM_SEPARATION, "stem_separation")}
                disabled={Boolean(busyItem)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
              >
                {busyItem === STEM_SEPARATION.item ? (
                  <>
                    <Spinner size={12} /> {t("billing.redirecting")}
                  </>
                ) : (
                  t("billing.buyOne")
                )}
              </button>
            </div>
          </div>

          {chordQuota ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">
                {currentPlan === "pro" || chordSubscriptionActive ? t("billing.chordDetection") : t("billing.freeTrialChords")}
              </p>
              <p className="m-0 text-xs text-zinc-500">
                {currentPlan === "pro"
                  ? t("billing.unlimitedAllAccess")
                  : chordSubscriptionActive
                    ? t("billing.unlimitedChordsMonthly")
                    : `${t("billing.leftOf", { remaining: chordQuota.remaining, limit: chordQuota.limit })} · ${t("billing.oneTimeNoRenew")}${
                        extraChordCredits > 0 ? ` · ${t("billing.plusCreditsChord", { n: extraChordCredits, s: extraChordCredits === 1 ? "" : "s" })}` : ""
                      }`}
              </p>
            </div>
          ) : null}

          {currentPlan !== "pro" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {!chordSubscriptionActive ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 p-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm text-white">
                      {CHORD_DETECTION.label} — {CHORD_DETECTION.price}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-zinc-500">{CHORD_DETECTION.blurb}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => buyOneTime(CHORD_DETECTION, "chord_detection")}
                    disabled={Boolean(busyItem)}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
                  >
                    {busyItem === CHORD_DETECTION.item ? (
                      <>
                        <Spinner size={12} /> {t("billing.redirecting")}
                      </>
                    ) : (
                      t("billing.buyOne")
                    )}
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brass/30 bg-brass/[0.05] p-3">
                <div className="min-w-0">
                  <p className="m-0 text-sm text-white">
                    {CHORDS_MONTHLY.label} — {CHORDS_MONTHLY.price}
                    {CHORDS_MONTHLY.period}
                    {chordSubscriptionActive ? (
                      <span className="ml-2 rounded-full border border-brass/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-brass">
                        {t("billing.current")}
                      </span>
                    ) : null}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-zinc-500">{CHORDS_MONTHLY.blurb}</p>
                </div>
                {chordSubscriptionActive ? (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={Boolean(busyItem)}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-brass/50 bg-brass/[0.18] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                  >
                    {busyItem === "portal" ? (
                      <>
                        <Spinner size={12} /> {t("billing.redirecting")}
                      </>
                    ) : (
                      t("billing.manageShort")
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => buyOneTime(CHORDS_MONTHLY, "chords_monthly")}
                    disabled={Boolean(busyItem)}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-brass/50 bg-brass/[0.18] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                  >
                    {busyItem === CHORDS_MONTHLY.item ? (
                      <>
                        <Spinner size={12} /> {t("billing.redirecting")}
                      </>
                    ) : (
                      t("billing.subscribe")
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {currentPlan === "pro" && stemQuota ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 text-sm text-white">{t("billing.stemsThisMonth")}</p>
              <p className="m-0 text-xs text-zinc-500">
                {t("billing.leftOf", { remaining: stemQuota.remaining, limit: stemQuota.limit })} · {t("billing.resetsNextMonth")}
                {extraStemCredits > 0 ? ` · ${t("billing.plusCreditsStem", { n: extraStemCredits, s: extraStemCredits === 1 ? "" : "s" })}` : ""}
              </p>
            </div>
          ) : null}
        </>
      )}
      {changeStatus ? <p className="mt-3 text-sm text-brass">{changeStatus}</p> : null}
      {checkoutError ? <p className="mt-3 text-sm text-red-300">{checkoutError}</p> : null}
    </div>
  );
}
