"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import { LoadingBlock } from "@/components/ui/Spinner";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function trendBadge(count, previousCount) {
  if (!previousCount) return null;
  const deltaPct = Math.round(((count - previousCount) / previousCount) * 100);
  if (deltaPct === 0) return <span className="text-zinc-500">→ 0%</span>;
  const up = deltaPct > 0;
  return <span className={up ? "text-ember" : "text-emerald-400"}>{up ? "↑" : "↓"} {Math.abs(deltaPct)}%</span>;
}

const COLUMNS = [
  { key: "event", label: "Event" },
  { key: "reason", label: "Reason" },
  { key: "count", label: "Count", align: "right" },
  { key: "affectedSessions", label: "Sessions", align: "right" },
  { key: "trend", label: "Vs Previous", align: "right", render: (r) => trendBadge(r.count, r.previousCount) },
  { key: "lastSeen", label: "Last Seen", align: "right", render: (r) => formatDate(r.lastSeen) },
];

// Spec section 27 — grouped, normalized failures affecting the funnel
// (upload/mastering/checkout), not a general error/observability log.
export default function AdminErrorsPage() {
  const [preset, setPreset] = useState("7d");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    getAdminAnalytics("/errors", { preset })
      .then((res) => !cancelled && setRows(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load errors."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Errors</h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && !error ? <LoadingBlock /> : null}
      {rows ? <AdminTable columns={COLUMNS} rows={rows.map((r, i) => ({ ...r, id: `${r.event}-${r.reason}-${i}` }))} emptyLabel="No funnel-affecting failures in this period." /> : null}
    </div>
  );
}
