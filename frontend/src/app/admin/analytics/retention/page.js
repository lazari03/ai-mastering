"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import StatCard from "@/components/admin/StatCard";
import { IconRefresh, IconUsers } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// Spec section 13 — scoped to what's actually implemented right now:
// unique vs. returning visitors within the selected window. DAU/WAU/MAU
// and the subscriber-specific "masters per subscriber" / renewal-vs-churn
// correlation views described in the full spec are NOT built yet — see
// the report's "known limitations." This page is intentionally honest
// about that rather than showing numbers for something not computed.
export default function AdminRetentionPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getAdminAnalytics("/retention", { preset })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || t("admin.retention.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [preset, t]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconRefresh />
          {t("admin.retention.title")}
        </h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}
      {data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard label={t("admin.retention.uniqueVisitors")} stat={data.uniqueVisitors} icon={IconUsers} />
          <StatCard label={t("admin.stat.returningVisitors")} stat={data.returningVisitors} icon={IconRefresh} />
          <StatCard label={t("admin.retention.returningPct")} stat={`${data.returningPct}%`} icon={IconRefresh} />
        </div>
      ) : null}
      <p className="text-xs text-zinc-500">{t("admin.retention.note")}</p>
    </div>
  );
}
