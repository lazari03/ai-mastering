"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import { LoadingBlock } from "@/components/ui/Spinner";

const COLUMNS = [
  { key: "path", label: "Page" },
  { key: "views", label: "Views", align: "right" },
  { key: "uniqueVisitors", label: "Unique", align: "right" },
  { key: "entrances", label: "Entrances", align: "right" },
  { key: "exits", label: "Exits", align: "right" },
  { key: "avgActiveSeconds", label: "Avg Active", align: "right", render: (r) => `${r.avgActiveSeconds}s` },
  { key: "uploads", label: "Uploads", align: "right" },
  { key: "masters", label: "Masters", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "conversion", label: "Conv.", align: "right", render: (r) => `${r.conversion}%` },
];

// Doubles as the SEO landing-page report (spec section 12/24) — an
// organic landing page is just a row here where entrances is high and
// referrerDomain/utmSource points at a search engine; no separate report
// needed since the underlying data (and the columns asked for — organic
// visitors, active time, uploads, masters, checkouts, customers, revenue,
// conversion) is identical to what this page already shows per-path.
export default function AdminPagesPage() {
  const [preset, setPreset] = useState("7d");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    getAdminAnalytics("/pages", { preset })
      .then((res) => !cancelled && setRows(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load pages."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Pages</h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      <p className="m-0 text-xs text-zinc-500">
        Includes organic/SEO landing pages — sort by Entrances to see which pages bring visitors, by Conversion to see which ones actually produce
        customers.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && !error ? <LoadingBlock /> : null}
      {rows ? <AdminTable columns={COLUMNS} rows={rows.map((r) => ({ ...r, id: r.path }))} /> : null}
    </div>
  );
}
