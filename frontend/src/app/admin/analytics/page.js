"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import ExportButtons from "@/components/admin/ExportButtons";
import TrendChart from "@/components/admin/TrendChart";
import {
  IconUsers,
  IconUserPlus,
  IconUserCheck,
  IconClock,
  IconUpload,
  IconWaveform,
  IconTag,
  IconCart,
  IconUserCheck as IconCustomer,
  IconCoins,
  IconRefresh,
  IconShield,
  IconXCircle,
  IconFunnel,
  IconTarget,
} from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// Validated against this dashboard's own dark surface (#151412-ish card
// background) via the dataviz skill's palette validator — 4 slots, all
// checks pass (lightness band, chroma floor, CVD separation, normal-vision
// floor, contrast). Kept here rather than in Tailwind config since only
// chart series need raw hex (SVG stroke/fill can't consume CSS vars the
// same way Tailwind classes do without extra plumbing).
const CHART_COLORS = { ember: "#d9663a", teal: "#1f9686", gold: "#b78832", rose: "#b0526a" };

function formatMinSec(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatCompact(n) {
  return Math.round(n).toLocaleString();
}

export default function AdminOverviewPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setTrend(null);
    setError("");
    Promise.all([getAdminAnalytics("/overview", { preset }), getAdminAnalytics("/overview-timeseries", { preset })])
      .then(([overview, timeseries]) => {
        if (cancelled) return;
        setData(overview);
        setTrend(timeseries.points);
      })
      .catch((err) => !cancelled && setError(err?.message || t("admin.overview.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [preset, t]);

  const stats = data
    ? [
        { key: "visitors", label: t("admin.stat.visitors"), stat: data.visitors, icon: IconUsers },
        { key: "newVisitors", label: t("admin.stat.newVisitors"), stat: data.newVisitors, icon: IconUserPlus },
        { key: "returningVisitors", label: t("admin.stat.returningVisitors"), stat: data.returningVisitors, icon: IconRefresh },
        { key: "signups", label: t("admin.stat.signups"), stat: data.signups, icon: IconUserCheck },
        { key: "avgTime", label: t("admin.stat.avgTimeOnSite"), stat: { ...data.avgSessionSeconds, value: formatMinSec(data.avgSessionSeconds.value) }, icon: IconClock },
        { key: "uploads", label: t("admin.stat.uploads"), stat: data.uploads, icon: IconUpload },
        { key: "masters", label: t("admin.stat.masters"), stat: data.masters, icon: IconWaveform },
        { key: "pricingViews", label: t("admin.stat.pricingViews"), stat: data.pricingViews, icon: IconTag },
        { key: "checkoutStarts", label: t("admin.stat.checkoutStarts"), stat: data.checkoutStarts, icon: IconCart },
        { key: "newCustomers", label: t("admin.stat.newCustomers"), stat: data.newCustomers, icon: IconCustomer },
        { key: "revenue", label: t("admin.stat.revenue"), stat: data.revenue, suffix: " €", icon: IconCoins },
        { key: "mrr", label: t("admin.stat.mrr"), stat: Math.round(data.mrr), suffix: " €", icon: IconCoins },
        { key: "activeSubscribers", label: t("admin.stat.activeSubscribers"), stat: data.activeSubscribers, icon: IconShield },
        { key: "cancellations", label: t("admin.stat.cancellations"), stat: data.cancellations, icon: IconXCircle },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">{t("admin.overview.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/overview" params={{ preset }} />
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {stats.map((s) => (
              <StatCard key={s.key} label={s.label} stat={s.stat} suffix={s.suffix} icon={s.icon} />
            ))}
          </div>

          {trend && trend.length > 1 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="m-0 mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.overview.trendTitle")}</p>
                <TrendChart
                  ariaLabel={t("admin.overview.trendTitle")}
                  series={[
                    { key: "visitors", label: t("admin.stat.visitors"), color: CHART_COLORS.ember },
                    { key: "masters", label: t("admin.stat.masters"), color: CHART_COLORS.teal },
                  ]}
                  points={trend.map((p) => ({ x: p.date.slice(5), visitors: p.visitors, masters: p.masters }))}
                  formatValue={formatCompact}
                />
              </div>
              <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="m-0 mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.overview.revenueTrendTitle")}</p>
                <TrendChart
                  ariaLabel={t("admin.overview.revenueTrendTitle")}
                  series={[{ key: "revenue", label: t("admin.stat.revenue"), color: CHART_COLORS.gold }]}
                  points={trend.map((p) => ({ x: p.date.slice(5), revenue: p.revenue }))}
                  formatValue={(v) => `€${v.toLocaleString()}`}
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="m-0 mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
              <IconTarget width={13} height={13} />
              {t("admin.overview.conversionTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label={t("admin.stat.visitorToUpload")} stat={`${data.conversion.visitorToUpload}%`} icon={IconFunnel} />
              <StatCard label={t("admin.stat.visitorToMaster")} stat={`${data.conversion.visitorToMaster}%`} icon={IconFunnel} />
              <StatCard label={t("admin.stat.visitorToPaid")} stat={data.conversion.visitorToPaid} suffix="%" icon={IconFunnel} />
              <StatCard label={t("admin.stat.checkoutToPaid")} stat={`${data.conversion.checkoutToPaid}%`} icon={IconFunnel} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
