"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconTarget } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

function currencyTotals(row) {
  const parts = row.revenueByCurrency || [];
  if (!parts.length) return "—";
  return parts.map(({ currency, amount }) => currency === "UNKNOWN"
    ? `?${amount.toFixed(2)}`
    : `${currency} ${amount.toFixed(2)}`).join(" · ");
}

export default function AdminAcquisitionPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: rows, error, loading } = useAdminQuery(() => getAdminAnalytics("/acquisition", { preset }), [preset, t]);

  const columns = [
    { key: "source", label: t("admin.table.source") },
    { key: "visitors", label: t("admin.table.visitors"), align: "right" },
    { key: "newVisitors", label: t("admin.table.new"), align: "right" },
    { key: "uploads", label: t("admin.table.uploads"), align: "right" },
    { key: "masters", label: t("admin.table.masters"), align: "right" },
    { key: "checkouts", label: t("admin.table.checkouts"), align: "right" },
    { key: "customers", label: t("admin.overview.paidAccounts"), align: "right" },
    { key: "revenue", label: t("admin.table.revenue"), align: "right", render: currencyTotals },
    { key: "conversion", label: t("admin.table.conversion"), align: "right", render: (r) => `${r.conversion}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconTarget />
          {t("admin.acquisition.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/acquisition" params={{ preset }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && loading ? <LoadingBlock /> : null}
      {rows ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <p className="m-0 mb-2 text-[11px] leading-4 text-zinc-500">{t("admin.acquisition.attributionNote")}</p>
          <AdminTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.source }))} emptyLabel={t("admin.table.noData")} />
        </div>
      ) : null}
    </div>
  );
}
