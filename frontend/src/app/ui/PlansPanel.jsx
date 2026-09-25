"use client";

import { useEffect, useState } from "react";

import { postCheckout, postChangePlan, postBillingPortal } from "@/network/http/client";
import { BILLING_PERIODS, PLANS, PLAN_ORDER, SINGLE_MASTER, STEM_SEPARATION, planPricing } from "@/lib/pricing";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { trackEvent } from "@/lib/analytics";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import { IconCheck } from "@/components/app/icons";
import InlineAlert from "@/components/ui/InlineAlert";
import { PLAN_COMPARISON } from "@/lib/product";

// Feature-by-feature comparison rows — Free/Indie/Studio/All-Access
// columns, in PLAN_ORDER. "—" means not included, everything else is the
// actual value for that plan. Hand-written rather than derived from
// PLANS' prose `features` arrays since those are marketing bullet points
// (not every plan lists every axis, and the wording differs), while a
// comparison table needs one consistent row per axis across all columns.
//
// Every row must have exactly PLAN_ORDER.length values, in that order —
// there's an assertion below rather than a comment alone, because a row
// that's one short doesn't fail loudly, it silently shifts every value
// after it into the wrong column and misprices the table.
const COMPARISON_ROWS = PLAN_COMPARISON;

const misalignedRow = COMPARISON_ROWS.find((row) => row.values.length !== PLAN_ORDER.length);
if (misalignedRow) {
  throw new Error(
    `COMPARISON_ROWS "${misalignedRow.label}" has ${misalignedRow.values.length} values but PLAN_ORDER has ` +
      `${PLAN_ORDER.length} plans — every row needs one value per plan or the table silently shows the wrong column.`,
  );
}

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
    subscription,
    masterQuota,
    extraCredits,
    stemQuota,
    extraStemCredits,
    loaded,
    refresh,
  } = useEntitlementsStore();
  // Set once a downgrade is scheduled (see polarService.js's
  // changeSubscriptionPlan — a "next_period" change deliberately leaves
  // the current plan's productId untouched until the real renewal), so
  // currentPlan alone can't show it. Without this the Studio/All-Access
  // cards look completely unchanged after a successful downgrade click —
  // the obvious next thing to do is click it again, which used to hit
  // Polar's own "already has a pending update" error.
  const pendingPlan = subscription?.pendingPlan || null;
  const pendingBilling = subscription?.pendingBilling || null;
  const pendingAppliesAt = subscription?.pendingAppliesAt ? new Date(subscription.pendingAppliesAt) : null;
  // Monthly vs yearly for the paid plan the user holds — a plan key alone
  // ("studio") can't tell Studio monthly from Studio yearly.
  const currentBilling = currentPlan && currentPlan !== "free" ? subscription?.billing || "monthly" : null;
  // Which prices the cards show. ?billing=annual (from a public pricing
  // CTA, through signup) wins; otherwise it follows what the user is
  // already billed on, so a yearly subscriber sees their own prices.
  const [billing, setBilling] = useState("monthly");
  const [billingTouched, setBillingTouched] = useState(false);
  // One effect, not two: as separate effects the "follow current billing"
  // one ran in the same commit with a stale billingTouched and overwrote
  // the URL's choice.
  useEffect(() => {
    if (billingTouched) return;
    const requested = new URLSearchParams(window.location.search).get("billing");
    if (BILLING_PERIODS.includes(requested)) {
      setBilling(requested);
      setBillingTouched(true);
    } else if (currentBilling) {
      setBilling(currentBilling);
    }
  }, [billingTouched, currentBilling]);
  const [busyItem, setBusyItem] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [changeStatus, setChangeStatus] = useState("");

  useEffect(() => {
    trackEvent("pricing_view", { source: "app_plans_tab" });
  }, []);

  // planKey/price are threaded through the success URL so /thank-you can
  // fire a client-side GA4 "purchase" event as a fallback — the real,
  // reliable copy of that event now fires server-side from the Polar
  // order.paid webhook (see polarService.js), immune to ad-blockers and
  // closed tabs during redirect.
  //
  // Already on a paid plan -> change-plan (modifies the existing
  // subscription in place, Polar handles proration). Currently free ->
  // checkout (nothing exists yet to modify).
  const buy = async (item, planKey, priceLabel, period) => {
    const planLabel = `${PLANS[planKey]?.label || planKey}${period === "annual" ? ` (${t("pricing.billing.annual")})` : ""}`;
    setBusyItem(item);
    setCheckoutError("");
    setChangeStatus("");
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(priceLabel).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: item, item_name: planKey }],
      checkout_source: "app_plans_tab",
    });
    try {
      if (currentPlan && currentPlan !== "free") {
        const { immediate } = await postChangePlan(item);
        await refresh();
        setBusyItem("");
        setChangeStatus(immediate ? t("billing.switchedTo", { plan: planLabel }) : t("billing.scheduledTo", { plan: planLabel }));
        return;
      }
      const successUrl = `${window.location.origin}/thank-you?plan=${encodeURIComponent(planKey)}&item=${encodeURIComponent(item)}&price=${encodeURIComponent(priceLabel)}&billing=${encodeURIComponent(period)}`;
      const response = await postCheckout(item, successUrl);
      // The backend independently detects an already-active subscription
      // (see masteringRoutes.js's /billing/checkout) regardless of what
      // currentPlan this component cached — if that cache was stale, this
      // never reaches Polar's checkout at all, it just performs the plan
      // change directly, same as the isCurrentPlan-aware branch above.
      if (response.changedPlan) {
        await refresh();
        setBusyItem("");
        setChangeStatus(response.immediate ? t("billing.switchedTo", { plan: planLabel }) : t("billing.scheduledTo", { plan: planLabel }));
        return;
      }
      window.location.href = response.url;
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
      checkout_source: "app_plans_tab",
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
      <h1 className="m-0 text-[26px]">{t("billing.title")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{t("plans.subtitle")}</p>

      {!loaded ? (
        <LoadingBlock />
      ) : (
        <>
          {currentBilling ? (
            <p className="m-0 mt-4 text-[13px] text-text-secondary">
              {t("billing.currentSummary", { plan: PLANS[currentPlan]?.label, period: t(`pricing.billing.${currentBilling}`).toLowerCase() })}
            </p>
          ) : null}

          {/* Monthly / yearly — same segmented control as the homepage
              pricing grid, so the choice reads the same everywhere. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label={t("pricing.billingLabel")} className="inline-flex rounded-full bg-black/[0.055] p-1">
              {BILLING_PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  role="radio"
                  aria-checked={billing === period}
                  onClick={() => {
                    setBilling(period);
                    setBillingTouched(true);
                  }}
                  className={`rounded-full px-5 py-2 text-[13px] font-semibold transition-colors ${
                    billing === period ? "bg-white text-text-primary shadow-[0_1px_3px_rgba(36,32,26,0.18)]" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t(`pricing.billing.${period}`)}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-text-secondary">{t("pricing.annualSaving")}</span>
          </div>

          {/* Plan cards */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const pricing = planPricing(plan, billing);
              const cardBilling = key === "free" ? null : billing;
              const onThisPlan = currentPlan === key;
              // Exactly this card: same plan AND same billing period.
              // Same plan, other period is a monthly<->yearly switch.
              const isCurrent = onThisPlan && (key === "free" || currentBilling === cardBilling);
              const isPeriodSwitch = onThisPlan && !isCurrent;
              const isUpgrade = PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan);
              const isPendingTarget = pendingPlan === key && (pendingBilling || "monthly") === cardBilling;
              const actionLabel = isPeriodSwitch
                ? t(cardBilling === "annual" ? "billing.switchToAnnual" : "billing.switchToMonthly")
                : isUpgrade
                  ? t("billing.upgrade")
                  : t("billing.switch");
              return (
                <div
                  key={key}
                  className={`flex flex-col rounded-xl border p-4 ${isCurrent ? "border-text-primary/40 bg-white/70" : "border-border-subtle bg-black/[0.045]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-text-primary">{plan.label}</p>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-accent">
                        {t("billing.current")}
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 text-lg font-bold text-text-primary">
                    {pricing.price}
                    <span className="text-xs font-normal text-text-secondary">{pricing.period}</span>
                  </p>
                  <p className="m-0 h-4 text-[11px] text-text-secondary">
                    {pricing.perMonth ? t("pricing.perMonthEquivalent", { price: pricing.perMonth }) : ""}
                  </p>
                  <ul className="m-0 mt-2 flex flex-col gap-1 pl-4 text-xs text-text-secondary">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-3">
                    {key === "free" ? null : isCurrent ? (
                      <button
                        type="button"
                        onClick={openPortal}
                        disabled={Boolean(busyItem)}
                        className="flex w-full items-center justify-center gap-2 rounded-full border border-border-subtle bg-black/[0.05] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-accent hover:bg-black/[0.06] disabled:opacity-50"
                      >
                        {busyItem === "portal" ? (
                          <>
                            <Spinner size={12} /> {t("billing.redirecting")}
                          </>
                        ) : (
                          t("billing.manage")
                        )}
                      </button>
                    ) : isPendingTarget ? (
                      <p className="m-0 rounded-full border border-border-subtle bg-black/[0.045] px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                        {pendingAppliesAt ? t("billing.scheduledFor", { date: pendingAppliesAt.toLocaleDateString() }) : t("billing.scheduled")}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => buy(pricing.item, plan.key, pricing.price, billing)}
                        disabled={Boolean(busyItem)}
                        className={`flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] disabled:opacity-50 ${
                          isUpgrade || isPeriodSwitch
                            ? "bg-text-primary text-bg hover:opacity-85"
                            : "border border-border-subtle bg-black/[0.045] text-text-primary hover:border-text-primary/30"
                        }`}
                      >
                        {busyItem === pricing.item ? (
                          <>
                            <Spinner size={12} /> {currentPlan !== "free" ? t("billing.updating") : t("billing.redirecting")}
                          </>
                        ) : (
                          actionLabel
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature comparison table */}
          <div className="mt-6 overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-black/[0.045]">
                  <th className="p-3 text-left text-xs uppercase tracking-[0.1em] text-text-secondary">{t("plans.feature")}</th>
                  {PLAN_ORDER.map((key) => (
                    <th key={key} className="p-3 text-left text-xs uppercase tracking-[0.1em] text-text-secondary">
                      {PLANS[key].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border-subtle last:border-0">
                    <td className="p-3 text-text-secondary">{row.label}</td>
                    {row.values.map((value, i) => (
                      <td key={PLAN_ORDER[i]} className="p-3 text-text-secondary">
                        {value === true ? (
                          <IconCheck className="text-accent" />
                        ) : value === false ? (
                          <span className="text-text-secondary">—</span>
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
            <div className="mt-6 rounded-xl border border-border-subtle bg-black/[0.045] p-3">
              <p className="m-0 text-sm text-text-primary">{masterQuota.resets ? t("billing.mastersThisMonth") : t("billing.freeTrialMasters")}</p>
              <p className="m-0 text-xs text-text-secondary">
                {t("billing.leftOf", { remaining: masterQuota.remaining, limit: masterQuota.limit })}
                {" · "}
                {masterQuota.resets ? t("billing.resetsNextMonth") : t("billing.oneTimeNoRenew")}
                {extraCredits > 0 ? ` · ${t("billing.plusCreditsMaster", { n: extraCredits, s: extraCredits === 1 ? "" : "s" })}` : ""}
              </p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border-subtle bg-black/10 p-3">
              <div className="min-w-0">
                <p className="m-0 text-sm text-text-primary">
                  {SINGLE_MASTER.label} — {SINGLE_MASTER.price}
                </p>
                <p className="m-0 mt-0.5 text-xs text-text-secondary">
                  {SINGLE_MASTER.blurb} {t("billing.noSubNote")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => buyOneTime(SINGLE_MASTER, "single_master")}
                disabled={Boolean(busyItem)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-black/[0.045] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30 disabled:opacity-50"
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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border-subtle bg-black/10 p-3">
              <div className="min-w-0">
                <p className="m-0 text-sm text-text-primary">
                  {STEM_SEPARATION.label} — {STEM_SEPARATION.price}
                </p>
                <p className="m-0 mt-0.5 text-xs text-text-secondary">
                  {currentPlan === "pro" ? t("billing.stemNoteAllAccess") : `${STEM_SEPARATION.blurb} ${t("billing.stemNoteOther")}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => buyOneTime(STEM_SEPARATION, "stem_separation")}
                disabled={Boolean(busyItem)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-black/[0.045] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30 disabled:opacity-50"
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

          {currentPlan === "pro" && stemQuota ? (
            <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-3">
              <p className="m-0 text-sm text-text-primary">{t("billing.stemsThisMonth")}</p>
              <p className="m-0 text-xs text-text-secondary">
                {t("billing.leftOf", { remaining: stemQuota.remaining, limit: stemQuota.limit })} · {t("billing.resetsNextMonth")}
                {extraStemCredits > 0 ? ` · ${t("billing.plusCreditsStem", { n: extraStemCredits, s: extraStemCredits === 1 ? "" : "s" })}` : ""}
              </p>
            </div>
          ) : null}
        </>
      )}
      {changeStatus ? <p className="mt-3 text-sm text-accent">{changeStatus}</p> : null}
      {checkoutError ? <InlineAlert size="sm" className="mt-3">{checkoutError}</InlineAlert> : null}
    </div>
  );
}
