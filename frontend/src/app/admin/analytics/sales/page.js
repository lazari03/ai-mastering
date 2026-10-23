"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconDollar, IconUserCheck as IconCustomer, IconRefresh, IconXCircle, IconCoins, IconCart } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

export default function AdminSalesPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data, error, loading } = useAdminQuery(() => getAdminAnalytics("/sales", { preset }), [preset, t]);

  const failureColumns = [
    { key: "reason", label: t("admin.table.reason") },
    { key: "count", label: t("admin.table.count"), align: "right" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconDollar />
          {t("admin.sales.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/sales" params={{ preset }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && loading ? <LoadingBlock /> : null}
      {data ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label={t("admin.stat.revenue")} stat={data.revenue.toFixed(2)} suffix=" €" icon={IconCoins} />
            <StatCard label={t("admin.stat.newCustomers")} stat={data.newCustomers} icon={IconCustomer} />
            <StatCard label={t("admin.sales.subscriptionsCreated")} stat={data.subscriptionsCreated} icon={IconRefresh} />
            <StatCard label={t("admin.sales.renewals")} stat={data.renewals} icon={IconRefresh} />
            <StatCard label={t("admin.stat.cancellations")} stat={data.cancellations} icon={IconXCircle} />
            <StatCard label={t("admin.sales.refunds")} stat={data.refunds} icon={IconXCircle} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.sales.checkoutSection")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label={t("admin.sales.started")} stat={data.checkout.started} icon={IconCart} />
              <StatCard label={t("admin.sales.succeeded")} stat={data.checkout.succeeded} icon={IconCart} />
              <StatCard label={t("admin.sales.failed")} stat={data.checkout.failed} icon={IconXCircle} />
              <StatCard label={t("admin.sales.abandoned")} stat={data.checkout.abandoned} icon={IconXCircle} />
            </div>
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.sales.failureReasonsSection")}</p>
            <AdminTable columns={failureColumns} rows={data.failureReasons.map((r) => ({ ...r, id: r.reason }))} emptyLabel={t("admin.sales.emptyFailures")} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
