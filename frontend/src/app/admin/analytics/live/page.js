"use client";

import { useEffect, useRef, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { countryLabel } from "@/lib/country";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import { IconRadio, IconUsers, IconClock } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

const REFRESH_MS = 15000;

function formatMinSec(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

// Polling, not a websocket/push feed (see analyticsQueryService.js's
// getLive doc comment) — every other admin report here already works this
// way, and "who's on the site right now, refreshed every 15s" is close
// enough to real-time for a solo-founder dashboard without adding a whole
// new transport just for this one page.
export default function AdminLivePage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAdminAnalytics("/live")
        .then((res) => !cancelled && setData(res))
        .catch((err) => !cancelled && setError(err?.message || t("admin.live.loadFailed")));
    };
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [t]);

  const countryColumns = [
    { key: "country", label: t("admin.table.country"), render: (r) => countryLabel(r.country) },
    { key: "visitors", label: t("admin.table.activeNow"), align: "right" },
  ];
  const pageColumns = [
    { key: "path", label: t("admin.table.page") },
    { key: "visitors", label: t("admin.table.activeNow"), align: "right" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconRadio />
          {t("admin.live.title")}
        </h1>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
          {t("admin.live.refreshNote")}
        </span>
      </div>
      <p className="m-0 text-xs text-zinc-500">{t("admin.live.windowNote", { minutes: data?.windowMinutes || 5 })}</p>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label={t("admin.table.activeNow")} stat={data.activeVisitors} icon={IconUsers} />
            <StatCard label={t("admin.live.avgActiveTime")} stat={formatMinSec(data.avgActiveSeconds)} icon={IconClock} />
            <StatCard label={t("admin.live.countries")} stat={data.countries.length} icon={IconUsers} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.live.byCountry")}</p>
            <AdminTable columns={countryColumns} rows={data.countries.map((c) => ({ ...c, id: c.country }))} emptyLabel={t("admin.live.empty")} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.live.byPage")}</p>
            <AdminTable columns={pageColumns} rows={data.pages.map((p) => ({ ...p, id: p.path }))} emptyLabel={t("admin.live.empty")} />
          </div>
        </>
      ) : null}
    </div>
  );
}
