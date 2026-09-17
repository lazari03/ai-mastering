"use client";

import { useState } from "react";
import Link from "next/link";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import { countryLabel } from "@/lib/country";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import ExportButtons from "@/components/admin/ExportButtons";
import { IconList } from "@/components/admin/icons";
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
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: sessions, error, loading } = useAdminQuery(
    () => getAdminAnalytics("/sessions", { preset, limit: 50 }).then((res) => res.sessions),
    [preset, t]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconList />
          {t("admin.sessions.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} />
          <ExportButtons path="/sessions" params={{ preset, limit: 50 }} />
        </div>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!sessions && loading ? <LoadingBlock /> : null}
      {sessions ? (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {sessions.length === 0 ? <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">{t("admin.sessions.empty")}</p> : null}
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/admin/analytics/sessions/${s.id}`}
              className="block rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-white/25"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.06em] ${s.authenticated ? "bg-brass/20 text-brass" : "bg-white/10 text-zinc-400"}`}>
                    {s.authenticated ? t("admin.sessions.registered") : t("admin.sessions.anonymous")}
                  </span>
                  <span className="text-zinc-400">{s.utmSource || s.referrerDomain || t("admin.sessions.direct")}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">
                    {s.deviceCategory} · {s.browser}
                  </span>
                  {s.country ? (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400">{countryLabel(s.country)}</span>
                    </>
                  ) : null}
                </div>
                <span className="text-[11px] text-zinc-500">{s.startedAt ? new Date(s.startedAt).toLocaleString() : ""}</span>
              </div>
              <p className="m-0 mt-1.5 truncate text-sm text-white">{s.landingPage}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{formatDuration(sessionDurationMs(s))}</span>
                <span>·</span>
                <span>{s.pageViewCount || 0} {t("admin.sessions.pages")}</span>
                {s.hasMastered ? <span className="text-emerald-400">· {t("admin.sessions.mastered")}</span> : null}
                {s.hasStartedCheckout ? <span className="text-brass">· {t("admin.sessions.checkout")}</span> : null}
                {s.hasPaid ? <span className="text-emerald-400">· {t("admin.sessions.paid")}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
