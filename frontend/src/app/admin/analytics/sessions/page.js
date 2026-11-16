"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import { countryLabel } from "@/lib/country";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import ExportButtons from "@/components/admin/ExportButtons";
import SessionIdentity from "@/components/admin/SessionIdentity";
import { IconList } from "@/components/admin/icons";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";

const PAGE_SIZE = 50;
const EXTRA_PRESETS = [{ key: "365d", label: "1Y" }];

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

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
        active ? "bg-white text-[#100b08]" : "border border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
      }`}
    >
      {children}
    </button>
  );
}

export default function AdminSessionsPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const [kind, setKind] = useState("all"); // all | returning | identified
  const [query, setQuery] = useState(""); // applied search (session/visitor/user id)
  const [draft, setDraft] = useState("");
  const [older, setOlder] = useState({ sessions: [], cursor: undefined, busy: false, error: "" });

  // /admin/analytics/sessions?q=<id> (linked from session detail) opens
  // straight into that person's/browser's full history.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setQuery(q);
      setDraft(q);
    }
  }, []);

  const params = {
    preset,
    limit: PAGE_SIZE,
    newOrReturning: kind === "returning" ? "returning" : null,
    identified: kind === "identified" ? "1" : null,
    q: query || null,
  };

  const { data, error, loading } = useAdminQuery(() => getAdminAnalytics("/sessions", params), [preset, kind, query, t]);

  // Any filter change restarts paging from the first page.
  useEffect(() => {
    setOlder({ sessions: [], cursor: undefined, busy: false, error: "" });
  }, [preset, kind, query]);

  const nextCursor = older.cursor === undefined ? data?.nextCursor : older.cursor;
  const sessions = data ? [...data.sessions, ...older.sessions] : null;

  const loadMore = async () => {
    if (!nextCursor) return;
    setOlder((o) => ({ ...o, busy: true, error: "" }));
    try {
      const res = await getAdminAnalytics("/sessions", { ...params, cursor: nextCursor });
      setOlder((o) => ({ sessions: [...o.sessions, ...res.sessions], cursor: res.nextCursor, busy: false, error: "" }));
    } catch (err) {
      setOlder((o) => ({ ...o, busy: false, error: err?.message || t("admin.sessions.loadFailed") }));
    }
  };

  const applySearch = (value) => {
    const v = value.trim();
    setDraft(v);
    setQuery(v);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconList />
          {t("admin.sessions.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter value={preset} onChange={setPreset} extraPresets={EXTRA_PRESETS} />
          <ExportButtons path="/sessions" params={params} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={kind === "all"} onClick={() => setKind("all")}>{t("admin.sessions.filterAll")}</Chip>
          <Chip active={kind === "returning"} onClick={() => setKind("returning")}>{t("admin.sessions.filterReturning")}</Chip>
          <Chip active={kind === "identified"} onClick={() => setKind("identified")}>{t("admin.sessions.filterIdentified")}</Chip>
        </div>
        <form
          className="flex min-w-0 flex-1 gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            applySearch(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("admin.sessions.searchPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-xs text-white placeholder:font-sans placeholder:text-zinc-600 focus:border-white/40 focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 hover:border-white/30">
            {t("admin.sessions.search")}
          </button>
          {query ? (
            <button type="button" onClick={() => applySearch("")} className="text-xs text-zinc-500 hover:text-zinc-300">
              {t("admin.sessions.clear")}
            </button>
          ) : null}
        </form>
      </div>
      {query ? <p className="m-0 text-xs text-zinc-500">{t("admin.sessions.searchHint")}</p> : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!sessions && loading ? <LoadingBlock /> : null}
      {sessions ? (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {sessions.length === 0 ? <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">{t("admin.sessions.empty")}</p> : null}
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-black/20 transition hover:border-white/25">
              <Link href={`/admin/analytics/sessions/${s.id}`} className="block p-3.5 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.06em] ${s.authenticated ? "bg-brass/20 text-brass" : "bg-white/10 text-zinc-400"}`}>
                      {s.authenticated ? t("admin.sessions.registered") : t("admin.sessions.anonymous")}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-400">
                      {s.isNewVisitor ? t("admin.sessionDetail.new") : t("admin.sessionDetail.returning")}
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
              {/* Outside the row <Link>: interactive elements can't nest inside an anchor. */}
              <div className="border-t border-white/5 px-3.5 py-2">
                <SessionIdentity session={s} onFilterUser={applySearch} />
              </div>
            </div>
          ))}
          {nextCursor ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={older.busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300 hover:border-white/25 disabled:opacity-60"
            >
              {older.busy ? <Spinner /> : null}
              {t("admin.sessions.loadMore")}
            </button>
          ) : null}
          {older.error ? <p className="text-sm text-red-300">{older.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
