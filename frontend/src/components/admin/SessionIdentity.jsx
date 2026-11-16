"use client";

import { useState } from "react";
import Link from "next/link";

import { useLanguage } from "@/lib/i18n";

function CopyId({ label, value }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); the full
      // id is still in the title tooltip for manual selection.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
    >
      <span className="font-sans uppercase tracking-[0.06em] text-zinc-500">{label}</span>
      {copied ? t("admin.sessions.copied") : value.slice(0, 8)}
    </button>
  );
}

// Session/visitor/user identity strip shared by the sessions list and the
// session detail page. userUid comes from the session itself or, for an
// anonymous return visit, from the browser's visitor record (userLinkedVia
// === "visitor"), so "who is this returning visitor" is answered inline.
export default function SessionIdentity({ session, onFilterUser }) {
  const { t } = useLanguage();
  const uid = session.userUid || session.uid || null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <CopyId label={t("admin.sessions.sessionId")} value={session.sessionId || session.id} />
      <CopyId label={t("admin.sessions.visitorId")} value={session.visitorId} />
      {uid ? (
        <>
          <Link
            href={`/admin/users/${uid}`}
            className="rounded-md bg-brass/15 px-1.5 py-0.5 font-semibold text-brass hover:bg-brass/25"
            title={uid}
          >
            {t("admin.sessions.user")}: {session.userEmail || uid}
          </Link>
          {session.userLinkedVia === "visitor" ? <span className="text-zinc-500">({t("admin.sessions.viaVisitor")})</span> : null}
          {onFilterUser ? (
            <button type="button" onClick={() => onFilterUser(uid)} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
              {t("admin.sessions.allSessions")} →
            </button>
          ) : null}
        </>
      ) : (
        <span className="text-zinc-600">{t("admin.sessions.noUser")}</span>
      )}
    </div>
  );
}
