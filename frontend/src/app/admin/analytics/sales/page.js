"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { LoadingBlock } from "@/components/ui/Spinner";

const FAILURE_COLUMNS = [
  { key: "reason", label: "Reason" },
  { key: "count", label: "Count", align: "right" },
];

export default function AdminSalesPage() {
  const [preset, setPreset] = useState("7d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getAdminAnalytics("/sales", { preset })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load sales."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Sales</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/sales" params={{ preset }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatCard label="Revenue" stat={data.revenue.toFixed(2)} suffix=" €" />
            <StatCard label="New Customers" stat={data.newCustomers} />
            <StatCard label="Subscriptions Created" stat={data.subscriptionsCreated} />
            <StatCard label="Renewals" stat={data.renewals} />
            <StatCard label="Cancellations" stat={data.cancellations} />
            <StatCard label="Refunds" stat={data.refunds} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Checkout</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Started" stat={data.checkout.started} />
              <StatCard label="Succeeded" stat={data.checkout.succeeded} />
              <StatCard label="Failed" stat={data.checkout.failed} />
              <StatCard label="Abandoned" stat={data.checkout.abandoned} />
            </div>
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Checkout Failure Reasons</p>
            <AdminTable columns={FAILURE_COLUMNS} rows={data.failureReasons.map((r) => ({ ...r, id: r.reason }))} emptyLabel="No checkout failures in this period." />
          </div>
        </>
      ) : null}
    </div>
  );
}
