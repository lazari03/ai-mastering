"use client";

import { useEffect, useRef, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import StatCard from "@/components/admin/StatCard";
import AdminTable from "@/components/admin/AdminTable";
import { LoadingBlock } from "@/components/ui/Spinner";

const REFRESH_MS = 15000;

const COUNTRY_COLUMNS = [
  { key: "country", label: "Country" },
  { key: "visitors", label: "Active Now", align: "right" },
];

const PAGE_COLUMNS = [
  { key: "path", label: "Page" },
  { key: "visitors", label: "Active Now", align: "right" },
];

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
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAdminAnalytics("/live")
        .then((res) => !cancelled && setData(res))
        .catch((err) => !cancelled && setError(err?.message || "Failed to load live overview."));
    };
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Live</h1>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
          Refreshes every 15s
        </span>
      </div>
      <p className="m-0 text-xs text-zinc-500">
        Visitors active in the last {data?.windowMinutes || 5} minutes — not a historical report, this has no date filter.
      </p>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && !error ? <LoadingBlock /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatCard label="Active Now" stat={data.activeVisitors} />
            <StatCard label="Avg. Active Time" stat={formatMinSec(data.avgActiveSeconds)} />
            <StatCard label="Countries" stat={data.countries.length} />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">By Country</p>
            <AdminTable columns={COUNTRY_COLUMNS} rows={data.countries.map((c) => ({ ...c, id: c.country }))} emptyLabel="No active visitors right now." />
          </div>

          <div>
            <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">By Page</p>
            <AdminTable columns={PAGE_COLUMNS} rows={data.pages.map((p) => ({ ...p, id: p.path }))} emptyLabel="No active visitors right now." />
          </div>
        </>
      ) : null}
    </div>
  );
}
