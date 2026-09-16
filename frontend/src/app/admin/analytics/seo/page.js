"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { LoadingBlock } from "@/components/ui/Spinner";

const COLUMNS = [
  { key: "path", label: "Landing Page" },
  { key: "visitors", label: "Visitors", align: "right" },
  { key: "avgActiveSeconds", label: "Avg Active", align: "right", render: (r) => `${r.avgActiveSeconds}s` },
  { key: "uploads", label: "Uploads", align: "right" },
  { key: "masters", label: "Masters", align: "right" },
  { key: "checkouts", label: "Checkouts", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", render: (r) => `€${r.revenue.toFixed(2)}` },
  { key: "conversion", label: "Conv.", align: "right", render: (r) => `${r.conversion}%` },
];

// Spec section 24/30 — "which SEO pages generate TRAFFIC" (Visitors/Avg
// Active) vs. "which SEO pages generate MONEY" (Paid/Revenue/Conversion)
// side by side in one table, scoped to organic sessions only (a search-
// engine referrer with no campaign UTM, or utm_medium=organic — see
// isOrganicSession in analyticsQueryService.js). Google Search Console
// remains the source of truth for queries/impressions/clicks (spec
// section 25) — this starts from the moment someone actually lands here.
export default function AdminSeoPage() {
  const [preset, setPreset] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getAdminAnalytics("/seo", { preset })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load SEO overview."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">SEO</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/seo" params={{ preset }} />
        </div>
      </div>
      <p className="m-0 text-xs text-zinc-500">
        Organic sessions only — arrived via a search engine, not a paid/social/direct visit. Query-level data
        (impressions, clicks, position) lives in Google Search Console, not here.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatCard label="Organic Visitors" stat={data.organicVisitors} />
            <StatCard label="Organic New Visitors" stat={data.organicNewVisitors} />
            <StatCard label="Organic Masters" stat={data.organicMasters} />
            <StatCard label="Organic Customers" stat={data.organicCustomers} />
            <StatCard label="Organic Revenue" stat={data.organicRevenue.toFixed(2)} suffix=" €" />
            <StatCard label="Visitor → Paid" stat={`${data.organicVisitorToPaid}%`} />
          </div>
          <AdminTable columns={COLUMNS} rows={data.pages.map((r) => ({ ...r, id: r.path }))} emptyLabel="No organic sessions in this period." />
        </>
      ) : null}
    </div>
  );
}
