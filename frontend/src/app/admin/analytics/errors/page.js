"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconAlertTriangle } from "@/components/admin/icons";
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

// Spec section 27 — grouped, normalized failures affecting the funnel
// (upload/mastering/checkout), not a general error/observability log.
export default function AdminErrorsPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: rows, error, loading } = useAdminQuery(() => getAdminAnalytics("/errors", { preset }), [preset, t]);

  const columns = [
    { key: "event", label: t("admin.table.event") },
    { key: "reason", label: t("admin.table.reason") },
    { key: "count", label: t("admin.table.count"), align: "right" },
    { key: "affectedSessions", label: t("admin.table.sessions"), align: "right" },
    { key: "trend", label: t("admin.table.vsPrevious"), align: "right", render: (r) => trendBadge(r.count, r.previousCount) },
    { key: "lastSeen", label: t("admin.table.lastSeen"), align: "right", render: (r) => formatDate(r.lastSeen) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconAlertTriangle />
          {t("admin.errors.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/errors" params={{ preset }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && loading ? <LoadingBlock /> : null}
      {rows ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <AdminTable columns={columns} rows={rows.map((r, i) => ({ ...r, id: `${r.event}-${r.reason}-${i}` }))} emptyLabel={t("admin.errors.empty")} />
        </div>
      ) : null}
    </div>
  );
}
