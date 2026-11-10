"use client";

import { useState } from "react";
import Link from "next/link";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import ExportButtons from "@/components/admin/ExportButtons";
import TrendChart from "@/components/admin/TrendChart";
import { LoadingBlock } from "@/components/ui/Spinner";

const COLORS = { ember: "#d9663a", teal: "#1f9686", gold: "#b78832" };
const number = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const amount = (n, currency) => {
  if (!currency || currency === "UNKNOWN") return number(n);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); }
  catch { return `${currency} ${number(n)}`; }
};

function Metric({ label, value, delta, help, accent = false }) {
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${accent ? "border-brass/35 bg-brass/[0.07]" : "border-white/10 bg-white/[0.025]"}`} title={help}>
      <p className="m-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="truncate text-[23px] font-semibold leading-tight tabular-nums tracking-tight text-white">{value ?? "—"}</span>
        {delta != null ? <span className={`text-[10px] font-medium tabular-nums ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-ember" : "text-zinc-500"}`}>{delta > 0 ? "+" : ""}{number(delta)}%</span> : null}
      </div>
    </div>
  );
}

function Section({ title, href, children, linkLabel }) {
  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.09em] text-zinc-300">{title}</h2>
        {href ? <Link href={href} className="text-[11px] font-medium text-brass hover:underline">{linkLabel} →</Link> : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminOverviewPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: combined, error, loading } = useAdminQuery(
    () => Promise.all([
      getAdminAnalytics("/overview", { preset }),
      getAdminAnalytics("/overview-timeseries", { preset }),
    ]).then(([overview, timeseries]) => ({ overview, trend: timeseries.points })),
    [preset]
  );
  const data = combined?.overview;
  const trend = combined?.trend || [];
  const currencies = data?.revenueByCurrency || [];
  const currency = currencies.length === 1 ? currencies[0].currency : null;
  const revenueText = currencies.length === 0
    ? amount(0, "EUR")
    : currencies.length === 1
      ? amount(currencies[0].amount, currency)
      : t("admin.overview.mixedCurrencies");
  const funnel = data?.conversion || {};
  const conversionItems = [
    [t("admin.stat.visitorToUpload"), funnel.visitorToUpload],
    [t("admin.stat.visitorToSignup"), funnel.visitorToSignup],
    [t("admin.stat.visitorToMaster"), funnel.visitorToMaster],
    [t("admin.overview.sessionPurchaseRate"), funnel.visitorToPaid?.value],
    [t("admin.stat.checkoutToPaid"), funnel.checkoutToPaid],
  ];
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="m-0 text-xl font-bold tracking-tight text-white">{t("admin.overview.title")}</h1>
          <p className="m-0 mt-0.5 text-[11px] text-zinc-500">{t("admin.overview.dataSource")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/overview" params={{ preset }} />
        </div>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div> : null}
      {!data && loading ? <LoadingBlock /> : null}
      {data ? <div className={`space-y-3.5 transition-opacity ${loading ? "opacity-50" : "opacity-100"}`} aria-busy={loading}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label={t("admin.stat.visitors")} value={number(data.visitors?.value)} delta={data.visitors?.deltaPct} help={t("admin.overview.visitorsHelp")} />
          <Metric label={t("admin.stat.signups")} value={number(data.signups?.value)} delta={data.signups?.deltaPct} />
          <Metric label={t("admin.stat.masters")} value={number(data.masters?.value)} delta={data.masters?.deltaPct} />
          <Metric label={t("admin.overview.paidAccounts")} value={number(data.paidAccounts?.value)} delta={data.paidAccounts?.deltaPct} help={t("admin.overview.paidAccountsHelp")} accent />
          <Metric label={t("admin.stat.revenue")} value={revenueText} delta={currencies.length <= 1 ? data.revenue?.deltaPct : null} help={t("admin.overview.revenueHelp")} accent />
          <Metric label={t("admin.stat.mrr")} value={amount(data.mrr, "EUR")} help={t("admin.overview.mrrHelp")} />
          <Metric label={t("admin.stat.newCustomers")} value={number(data.newCustomers?.value)} delta={data.newCustomers?.deltaPct} help={t("admin.overview.newCustomersHelp")} />
          <Metric label={t("admin.stat.activeSubscribers")} value={number(data.activeSubscribers)} />
        </div>
        {currencies.length > 1 ? <p className="m-0 text-[11px] text-zinc-400">{t("admin.overview.currencyBreakdown")}: {currencies.map((r) => amount(r.amount, r.currency)).join(" · ")}</p> : null}
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3"><Section title={t("admin.overview.trendTitle")} href="/admin/analytics/funnel" linkLabel={t("admin.overview.viewDetails")}>
            <div className="min-w-0 lg:col-span-3">
              {trend.length > 1 ? <TrendChart height={150} ariaLabel={t("admin.overview.trendTitle")} series={[{ key: "visitors", label: t("admin.stat.visitors"), color: COLORS.ember }, { key: "masters", label: t("admin.stat.masters"), color: COLORS.teal }]} points={trend.map((p) => ({ x: p.date.slice(5), visitors: p.visitors, masters: p.masters }))} formatValue={number} /> : <p className="m-0 text-xs text-zinc-500">{t("admin.table.noData")}</p>}
            </div>
          </Section></div>
          <section className="rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.09em] text-zinc-300">{t("admin.overview.conversionTitle")}</h2>
              <Link className="text-[11px] text-brass hover:underline" href="/admin/analytics/funnel">{t("admin.overview.viewDetails")} →</Link>
            </div>
            <div className="space-y-2">
              {conversionItems.map(([label, pct]) => <div key={label}>
                <div className="flex justify-between gap-3 text-[11px]"><span className="truncate text-zinc-400">{label}</span><span className="font-semibold tabular-nums text-zinc-100">{pct == null ? "—" : `${number(pct)}%`}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brass" style={{ width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%` }} /></div>
              </div>)}
            </div>
            <p className="m-0 mt-3 text-[10px] leading-4 text-zinc-500">{t("admin.overview.sessionRateHelp")}</p>
          </section>
        </div>
        <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-zinc-300 marker:text-brass">{t("admin.overview.moreMetrics")}</summary>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3 sm:grid-cols-4">
            <Metric label={t("admin.stat.uploads")} value={number(data.uploads?.value)} />
            <Metric label={t("admin.stat.previews")} value={number(data.previews?.value)} />
            <Metric label={t("admin.stat.checkoutStarts")} value={number(data.checkoutStarts?.value)} />
            <Metric label={t("admin.overview.transactions")} value={number(data.paymentTransactions)} />
            <Metric label={t("admin.stat.pricingViews")} value={number(data.pricingViews?.value)} />
            <Metric label={t("admin.stat.downloadsCompleted")} value={number(data.downloadsCompleted)} />
            <Metric label={t("admin.stat.sharesCreated")} value={number(data.sharesCreated)} />
            <Metric label={t("admin.stat.errors")} value={number(data.errorCount)} />
          </div>
        </details>
        <p className="m-0 text-[10px] leading-4 text-zinc-500">{t("admin.overview.footnote")}</p>
      </div> : null}
    </div>
  );
}
