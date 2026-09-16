"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { LoadingBlock } from "@/components/ui/Spinner";

const COLUMNS = [
  { key: "source", label: "Source" },
  { key: "visitors", label: "Visitors", align: "right" },
  { key: "newVisitors", label: "New", align: "right" },
  { key: "uploads", label: "Uploads", align: "right" },
  { key: "masters", label: "Masters", align: "right" },
  { key: "checkouts", label: "Checkouts", align: "right" },
  { key: "customers", label: "Paid", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", render: (r) => `€${r.revenue.toFixed(2)}` },
  { key: "conversion", label: "Conv.", align: "right", render: (r) => `${r.conversion}%` },
];

export default function AdminAcquisitionPage() {
  const [preset, setPreset] = useState("7d");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    getAdminAnalytics("/acquisition", { preset })
      .then((res) => !cancelled && setRows(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load acquisition."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Acquisition</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/acquisition" params={{ preset }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!rows && !error ? <LoadingBlock /> : null}
      {rows ? <AdminTable columns={COLUMNS} rows={rows.map((r) => ({ ...r, id: r.source }))} /> : null}
    </div>
  );
}
