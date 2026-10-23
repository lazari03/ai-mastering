"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
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
  IconShare,
  IconDownload,
  IconAlertTriangle,
} from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// Validated against this dashboard's own dark surface (#151412-ish card
// background) via the dataviz skill's palette validator — 4 slots, all
// checks pass (lightness band, chroma floor, CVD separation, contrast).
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

// A labeled group of stat cards — the previous version was one flat grid
// of 14 cards with no hierarchy, which is exactly the "hard to scan"
// complaint: a reader had to already know which of 14 equally-weighted
// tiles mattered. Three groups (who's here / what they're doing / what
// it's worth) turn that into three answerable questions instead of one
// wall of numbers.
function StatGroup({ title, Icon, children }) {
  return (
    <div>
      <p className="m-0 mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
        <Icon width={13} height={13} />
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: combined, error, loading } = useAdminQuery(
    () =>
      Promise.all([getAdminAnalytics("/overview", { preset }), getAdminAnalytics("/overview-timeseries", { preset })]).then(([overview, timeseries]) => ({
        overview,
        trend: timeseries.points,
      })),
    [preset, t]
  );
  const data = combined?.overview;
  const trend = combined?.trend;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">{t("admin.overview.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/overview" params={{ preset }} />
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && loading ? <LoadingBlock /> : null}

      {data ? (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {/* The two numbers everyone reaches for first, at hero size — not
              buried in a 14-tile grid at the same weight as "cancellations." */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-brass/30 bg-brass/[0.06] p-3.5">
              <p className="m-0 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <IconUsers className="text-brass" />
                {t("admin.stat.visitors")}
              </p>
              <p className="mt-1.5 text-3xl font-bold text-white">{data.visitors.value.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-ember/30 bg-ember/[0.06] p-3.5">
              <p className="m-0 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <IconCoins className="text-ember" />
                {t("admin.stat.revenue")}
              </p>
              <p className="mt-1.5 text-3xl font-bold text-white">€{data.revenue.value.toLocaleString()}</p>
            </div>
            <StatCard label={t("admin.stat.masters")} stat={data.masters} icon={IconWaveform} />
            <StatCard
              label={t("admin.stat.errors")}
              stat={data.errorCount}
              icon={IconAlertTriangle}
            />
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

          <StatGroup title={t("admin.overview.sectionAudience")} Icon={IconUsers}>
            <StatCard label={t("admin.stat.newVisitors")} stat={data.newVisitors} icon={IconUserPlus} />
            <StatCard label={t("admin.stat.returningVisitors")} stat={data.returningVisitors} icon={IconRefresh} />
            <StatCard label={t("admin.stat.signups")} stat={data.signups} icon={IconUserCheck} />
            <StatCard label={t("admin.stat.avgTimeOnSite")} stat={{ ...data.avgSessionSeconds, value: formatMinSec(data.avgSessionSeconds.value) }} icon={IconClock} />
          </StatGroup>

          <StatGroup title={t("admin.overview.sectionEngine")} Icon={IconWaveform}>
            <StatCard label={t("admin.stat.uploads")} stat={data.uploads} icon={IconUpload} />
            <StatCard label={t("admin.stat.sharesCreated")} stat={data.sharesCreated} icon={IconShare} />
            <StatCard label={t("admin.stat.downloadsCompleted")} stat={data.downloadsCompleted} icon={IconDownload} />
            <StatCard label={t("admin.stat.pricingViews")} stat={data.pricingViews} icon={IconTag} />
          </StatGroup>

          <StatGroup title={t("admin.overview.sectionRevenue")} Icon={IconCoins}>
            <StatCard label={t("admin.stat.checkoutStarts")} stat={data.checkoutStarts} icon={IconCart} />
            <StatCard label={t("admin.stat.newCustomers")} stat={data.newCustomers} icon={IconCustomer} />
            <StatCard label={t("admin.stat.mrr")} stat={Math.round(data.mrr)} suffix=" €" icon={IconCoins} />
            <StatCard label={t("admin.stat.activeSubscribers")} stat={data.activeSubscribers} icon={IconShield} />
            <StatCard label={t("admin.stat.cancellations")} stat={data.cancellations} icon={IconXCircle} />
          </StatGroup>

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
        </div>
      ) : null}
    </div>
  );
}
