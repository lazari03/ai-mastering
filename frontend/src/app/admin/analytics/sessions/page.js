"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import { LoadingBlock } from "@/components/ui/Spinner";

function formatDuration(ms) {
  if (!ms || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sessionDurationMs(session) {
  const start = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const end = session.endedAt ? new Date(session.endedAt).getTime() : session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : null;
  return start && end ? end - start : 0;
}

export default function AdminSessionsPage() {
  const [preset, setPreset] = useState("7d");
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSessions(null);
    getAdminAnalytics("/sessions", { preset, limit: 50 })
      .then((res) => !cancelled && setSessions(res.sessions))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load sessions."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Sessions</h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!sessions && !error ? <LoadingBlock /> : null}
      {sessions ? (
        <div className="space-y-2">
          {sessions.length === 0 ? <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">No sessions in this period.</p> : null}
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/admin/analytics/sessions/${s.id}`}
              className="block rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-white/25"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.06em] ${s.authenticated ? "bg-brass/20 text-brass" : "bg-white/10 text-zinc-400"}`}>
                    {s.authenticated ? "Registered" : "Anonymous"}
                  </span>
                  <span className="text-zinc-400">{s.utmSource || s.referrerDomain || "direct"}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{s.deviceCategory}</span>
                  {s.country ? (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400">{s.country}</span>
                    </>
                  ) : null}
                </div>
                <span className="text-[11px] text-zinc-500">{s.startedAt ? new Date(s.startedAt).toLocaleString() : ""}</span>
              </div>
              <p className="m-0 mt-1.5 truncate text-sm text-white">{s.landingPage}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{formatDuration(sessionDurationMs(s))}</span>
                <span>·</span>
                <span>{s.pageViewCount || 0} pages</span>
                {s.hasMastered ? <span className="text-emerald-400">· Mastered</span> : null}
                {s.hasStartedCheckout ? <span className="text-brass">· Checkout</span> : null}
                {s.hasPaid ? <span className="text-emerald-400">· Paid</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
