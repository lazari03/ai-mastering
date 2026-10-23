"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { countryLabel } from "@/lib/country";
import { LoadingBlock } from "@/components/ui/Spinner";

function formatDuration(ms) {
  if (!ms || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function eventLabel(event) {
  const time = new Date(event.ts).toLocaleTimeString([], { hour12: false });
  const target = event.name === "page_view" ? event.path : event.name;
  const reason = event.props?.reason ? ` (${event.props.reason})` : "";
  return { time, target: `${target}${reason}`, isPage: event.name === "page_view" };
}

// The session journey timeline (spec section 20) — reconstructs what one
// visitor actually did, chronologically, from the raw analyticsEvents for
// this sessionId. This is the "understand behavior without session
// replay" screen: no mouse movement, no recording, just the events
// already being tracked for the funnel, laid out in order.
export default function AdminSessionDetailPage() {
  const { t } = useLanguage();
  const params = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAdminAnalytics(`/sessions/${params.sessionId}`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err?.message || t("admin.sessionDetail.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [params.sessionId, t]);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!data) return <LoadingBlock />;

  const { session, events } = data;
  const start = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const end = session.endedAt ? new Date(session.endedAt).getTime() : session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : null;
  const totalMs = start && end ? end - start : 0;

  const outcome = session.hasPaid
    ? t("admin.sessionDetail.outcomePaid")
    : session.hasStartedCheckout
      ? t("admin.sessionDetail.outcomeCheckoutNoPay")
      : session.hasMastered
        ? t("admin.sessionDetail.outcomeMastered")
        : session.hasUploaded
          ? t("admin.sessionDetail.outcomeUploaded")
          : t("admin.sessionDetail.outcomeBrowsed");

  return (
    <div className="space-y-5">
      <Link href="/admin/analytics/sessions" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← {t("admin.sessions.title")}
      </Link>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>{session.authenticated ? t("admin.sessions.registered") : t("admin.sessions.anonymous")}</span>
          <span>{session.utmSource || session.referrerDomain || t("admin.sessions.direct")}</span>
          <span>
            {session.deviceCategory} · {session.browser}
          </span>
          {session.country ? <span>{countryLabel(session.country)}</span> : null}
          <span>{session.isNewVisitor ? t("admin.sessionDetail.new") : t("admin.sessionDetail.returning")}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("admin.sessionDetail.totalSession")}</p>
            <p className="mt-1 text-lg font-bold text-white">{formatDuration(totalMs)}</p>
          </div>
          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("admin.sessionDetail.active")}</p>
            <p className="mt-1 text-lg font-bold text-brass">{formatDuration(session.activeMs || 0)}</p>
          </div>
          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("admin.sessionDetail.pages")}</p>
            <p className="mt-1 text-lg font-bold text-white">{session.pageViewCount || 0}</p>
          </div>
          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("admin.sessionDetail.outcome")}</p>
            <p className="mt-1 text-sm font-semibold text-white">{outcome}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="m-0 mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">{t("admin.sessionDetail.journey")}</p>
        <ol className="space-y-2 border-l border-white/10 pl-4">
          {events
            .filter((e) => e.name !== "heartbeat")
            .map((event) => {
              const { time, target, isPage } = eventLabel(event);
              return (
                <li key={event.id} className="relative text-xs">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brass" />
                  <span className="font-mono text-zinc-500">{time}</span>{" "}
                  <span className={isPage ? "text-brass" : "text-zinc-200"}>{target}</span>
                  {event.source === "backend" ? (
                    <span className="ml-1.5 rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase text-zinc-500">
                      {t("admin.sessionDetail.server")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          {events.length === 0 ? <li className="text-zinc-500">{t("admin.sessionDetail.noEvents")}</li> : null}
        </ol>
      </div>
    </div>
  );
}
