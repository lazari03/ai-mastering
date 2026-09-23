"use client";

import { useCallback, useEffect, useState } from "react";

import { createShareLink, listShareLinks, revokeShareLink } from "@/network/http/client";
import InlineAlert from "@/components/ui/InlineAlert";

// Expiry choices offered to the user. The backend always caps a link at
// the master's own expiry, so "master" (null) is also the upper bound of
// every other choice.
const EXPIRY_OPTIONS = [
  { key: "master", seconds: null, labelKey: "myMasters.shareExpiry.master" },
  { key: "day", seconds: 24 * 3600, labelKey: "myMasters.shareExpiry.day" },
  { key: "hour", seconds: 3600, labelKey: "myMasters.shareExpiry.hour" },
];
const LIMIT_OPTIONS = [null, 1, 5, 25];

function timeLeft(t, iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return t("myMasters.expired");
  const hours = Math.floor(ms / 3600000);
  return hours < 1 ? t("myMasters.minutesLeft", { n: Math.max(1, Math.floor(ms / 60000)) }) : t("myMasters.hoursLeft", { n: hours });
}

const selectClass =
  "rounded-lg border border-border-subtle bg-black/[0.045] px-2 py-1.5 text-[11px] text-text-primary focus:border-accent focus:outline-none";
const smallButtonClass =
  "shrink-0 rounded-lg border border-border-subtle bg-black/[0.05] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-accent hover:bg-black/[0.06] disabled:opacity-50";

export default function ShareLinkManager({ jobId, t }) {
  const [expiryKey, setExpiryKey] = useState("master");
  const [limit, setLimit] = useState(null);
  const [links, setLinks] = useState(null);
  const [created, setCreated] = useState(null); // { url, ... } — shown once
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { links: list } = await listShareLinks(jobId);
      setLinks(list || []);
    } catch (err) {
      setError(err?.message || t("myMasters.shareLinksLoadFailed"));
      setLinks([]);
    }
  }, [jobId, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const option = EXPIRY_OPTIONS.find((o) => o.key === expiryKey);
      const link = await createShareLink(jobId, { expiresInSeconds: option?.seconds ?? null, maxDownloads: limit });
      setCreated(link);
      await refresh();
    } catch (err) {
      setError(err?.message || t("myMasters.shareFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (linkId) => {
    setRevokingId(linkId);
    setError("");
    try {
      await revokeShareLink(linkId);
      if (created?.id === linkId) setCreated(null);
      await refresh();
    } catch (err) {
      setError(err?.message || t("myMasters.shareFailed"));
    } finally {
      setRevokingId("");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS, permissions) — the link is still
      // visible and selectable in the box.
    }
  };

  // Newest first; keep the list short — ended links only matter briefly.
  const visibleLinks = (links || []).slice(0, 6);

  return (
    <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-3">
      <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-accent">{t("myMasters.shareLinkTitle")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{t("myMasters.shareLinkBody")}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.1em] text-text-secondary">
          {t("myMasters.shareExpiry")}
          <select value={expiryKey} onChange={(e) => setExpiryKey(e.target.value)} className={selectClass}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.1em] text-text-secondary">
          {t("myMasters.shareLimit")}
          <select value={limit ?? ""} onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
            {LIMIT_OPTIONS.map((n) => (
              <option key={n ?? "unlimited"} value={n ?? ""}>
                {n == null ? t("myMasters.shareLimit.unlimited") : t("myMasters.shareLimit.n", { n })}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleCreate} disabled={busy} className={smallButtonClass}>
          {busy ? t("myMasters.creatingLink") : t("myMasters.createLink")}
        </button>
      </div>

      {created ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={created.url}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-black/[0.045] px-2.5 py-2 text-[11px] text-text-primary"
            />
            <button type="button" onClick={copy} className={smallButtonClass}>
              {copied ? t("myMasters.copied") : t("myMasters.copy")}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-text-secondary">{t("myMasters.shareOnce")}</p>
        </div>
      ) : null}

      {error ? <InlineAlert size="xs" className="mt-2">{error}</InlineAlert> : null}

      <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("myMasters.shareLinks")}</p>
      {links === null ? null : visibleLinks.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-secondary">{t("myMasters.noShareLinks")}</p>
      ) : (
        <ul className="m-0 mt-1 list-none space-y-1.5 p-0">
          {visibleLinks.map((link) => {
            const active = link.status === "active";
            return (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className={active ? "text-text-primary" : "text-text-secondary line-through decoration-text-secondary/40"}>
                  {t(`myMasters.linkStatus.${link.status}`)}
                  {active ? ` · ${timeLeft(t, link.expires_at)}` : ""} ·{" "}
                  {link.max_downloads == null
                    ? t("myMasters.linkDownloads", { count: link.download_count })
                    : t("myMasters.linkDownloadsLimited", { count: link.download_count, max: link.max_downloads })}
                </span>
                {active ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(link.id)}
                    disabled={revokingId === link.id}
                    className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-red-700 hover:border-red-400/50 disabled:opacity-50"
                  >
                    {revokingId === link.id ? "…" : t("myMasters.revokeLink")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
