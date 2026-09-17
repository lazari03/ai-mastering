"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconSearch, IconUsers, IconUserPlus, IconWaveform, IconUserCheck, IconCoins, IconFunnel } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// Spec section 24/30 — "which SEO pages generate TRAFFIC" (Visitors/Avg
// Active) vs. "which SEO pages generate MONEY" (Paid/Revenue/Conversion)
// side by side in one table, scoped to organic sessions only (a search-
// engine referrer with no campaign UTM, or utm_medium=organic — see
// isOrganicSession in analyticsQueryService.js). Google Search Console
// remains the source of truth for queries/impressions/clicks (spec
// section 25) — this starts from the moment someone actually lands here.
export default function AdminSeoPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getAdminAnalytics("/seo", { preset })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || t("admin.seo.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [preset, t]);

  const columns = [
    { key: "path", label: t("admin.table.landingPage") },
    { key: "visitors", label: t("admin.table.visitors"), align: "right" },
    { key: "avgActiveSeconds", label: t("admin.table.avgActive"), align: "right", render: (r) => `${r.avgActiveSeconds}s` },
    { key: "uploads", label: t("admin.table.uploads"), align: "right" },
    { key: "masters", label: t("admin.table.masters"), align: "right" },
    { key: "checkouts", label: t("admin.table.checkouts"), align: "right" },
    { key: "paid", label: t("admin.table.paid"), align: "right" },
    { key: "revenue", label: t("admin.table.revenue"), align: "right", render: (r) => `€${r.revenue.toFixed(2)}` },
    { key: "conversion", label: t("admin.table.conversion"), align: "right", render: (r) => `${r.conversion}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconSearch />
          {t("admin.seo.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/seo" params={{ preset }} />
        </div>
      </div>
      <p className="m-0 text-xs text-zinc-500">{t("admin.seo.subtitle")}</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label={t("admin.seo.organicVisitors")} stat={data.organicVisitors} icon={IconUsers} />
            <StatCard label={t("admin.seo.organicNewVisitors")} stat={data.organicNewVisitors} icon={IconUserPlus} />
            <StatCard label={t("admin.seo.organicMasters")} stat={data.organicMasters} icon={IconWaveform} />
            <StatCard label={t("admin.seo.organicCustomers")} stat={data.organicCustomers} icon={IconUserCheck} />
            <StatCard label={t("admin.seo.organicRevenue")} stat={data.organicRevenue.toFixed(2)} suffix=" €" icon={IconCoins} />
            <StatCard label={t("admin.stat.visitorToPaid")} stat={`${data.organicVisitorToPaid}%`} icon={IconFunnel} />
          </div>
          <AdminTable columns={columns} rows={data.pages.map((r) => ({ ...r, id: r.path }))} emptyLabel={t("admin.seo.emptyPages")} />
        </>
      ) : null}
    </div>
  );
}
