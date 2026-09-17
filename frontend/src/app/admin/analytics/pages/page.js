"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconFileText } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// Doubles as the SEO landing-page report (spec section 12/24) — an
// organic landing page is just a row here where entrances is high and
// referrerDomain/utmSource points at a search engine; no separate report
// needed since the underlying data (and the columns asked for — organic
// visitors, active time, uploads, masters, checkouts, customers, revenue,
// conversion) is identical to what this page already shows per-path.
export default function AdminPagesPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: rows, error, loading } = useAdminQuery(() => getAdminAnalytics("/pages", { preset }), [preset, t]);

  const columns = [
    { key: "path", label: t("admin.table.page") },
    { key: "views", label: t("admin.table.views"), align: "right" },
    { key: "uniqueVisitors", label: t("admin.table.unique"), align: "right" },
    { key: "entrances", label: t("admin.table.entrances"), align: "right" },
    { key: "exits", label: t("admin.table.exits"), align: "right" },
    { key: "avgActiveSeconds", label: t("admin.table.avgActive"), align: "right", render: (r) => `${r.avgActiveSeconds}s` },
    { key: "uploads", label: t("admin.table.uploads"), align: "right" },
    { key: "masters", label: t("admin.table.masters"), align: "right" },
    { key: "paid", label: t("admin.table.paid"), align: "right" },
    { key: "conversion", label: t("admin.table.conversion"), align: "right", render: (r) => `${r.conversion}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconFileText />
          {t("admin.pages.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/pages" params={{ preset }} />
        </div>
      </div>
      <p className="m-0 text-xs text-zinc-500">{t("admin.pages.subtitle")}</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && loading ? <LoadingBlock /> : null}
      {rows ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <AdminTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.path }))} emptyLabel={t("admin.table.noData")} />
        </div>
      ) : null}
    </div>
  );
}
