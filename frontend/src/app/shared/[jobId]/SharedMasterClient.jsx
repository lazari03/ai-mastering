"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import LogoMark from "@/components/brand/LogoMark";
import { getSharedJobInfo, downloadFileSafely, getShareLinkInfo, downloadSharedFile } from "@/network/http/client";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";
import StatePanel from "@/components/site/StatePanel";

function formatExpiry(t, iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return t("shared.minutes", { n: Math.max(1, Math.floor(ms / 60000)) });
  return t("shared.hours", { n: hours, s: hours === 1 ? "" : "s" });
}

// Server error codes (backend-node shareLinkService) -> localized text.
function shareErrorText(t, err) {
  const known = ["not_found", "expired", "revoked", "exhausted", "master_gone", "rate_limited"];
  if (err?.code && known.includes(err.code)) return t(`shared.error.${err.code}`);
  return err?.message || t("shared.invalidOrExpired");
}

// Reads the share token from the URL fragment (/share#afs_...). The
// fragment never leaves the browser — it isn't sent to our servers or
// analytics and isn't in Referer headers — so it's where the secret lives.
function useFragmentToken(enabled) {
  const [token, setToken] = useState(null); // null = not read yet
  useEffect(() => {
    if (!enabled) return undefined;
    const read = () => setToken(decodeURIComponent(window.location.hash.replace(/^#/, "")).trim());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [enabled]);
  return token;
}

// Deliberately simple — this is a public page a non-account-holder lands
// on from a share link, not another app tab. One job's worth of info, one
// download button, nothing else. Two link formats:
//   fromFragment — current links: /share#<token>, validated server-side
//                  (expiry, revocation, download limit) on every request;
//   jobId+token  — legacy /shared/<jobId>?token=... links, kept working
//                  until the last ones issued expire.
export default function SharedMasterClient({ jobId, token: legacyToken, fromFragment = false }) {
  const { t } = useLanguage();
  const fragmentToken = useFragmentToken(fromFragment);
  const token = fromFragment ? fragmentToken : legacyToken;
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (token === null) return; // fragment not read yet
    setInfo(null);
    setError("");
    if (!token) {
      setError(t("shared.missingToken"));
      return;
    }
    const load = fromFragment ? getShareLinkInfo(token) : getSharedJobInfo(jobId, token);
    load.then(setInfo).catch((err) => setError(shareErrorText(t, err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, token, fromFragment]);

  const remaining = info ? formatExpiry(t, info.expires_at) : null;

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16 text-center sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 text-text-primary">
        <LogoMark size={20} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
          Auralith <span className="font-normal text-text-secondary">Forge</span>
        </span>
      </Link>

      {error ? (
        <StatePanel
          tone="error"
          title={t("shared.linkUnavailable")}
          body={error}
          headingLevel={1}
          compact
          actions={[
            { href: "/", label: t("shared.masterYourOwn") },
          ]}
        />
      ) : !info ? (
        <LoadingBlock />
      ) : (
        <div className="bezel w-full max-w-[420px]">
          <div className="bezel-core p-6 text-left sm:p-7">
            <p className="eyebrow m-0">{t("shared.sharedMaster")}</p>
            <h1 className="mt-3 truncate font-[var(--font-title)] text-[22px] font-semibold tracking-[-0.02em] text-text-primary">{info.filename}</h1>
            {info.before_lufs != null && info.after_lufs != null ? (
              <p className="mt-1 font-mono text-[12px] text-text-secondary">
                {info.before_lufs} → {info.after_lufs} LUFS
              </p>
            ) : null}

            <button
              type="button"
              onClick={async () => {
                setDownloadError("");
                setDownloading(true);
                try {
                  if (fromFragment) {
                    await downloadSharedFile(token, info.filename || "mastered.wav");
                  } else {
                    await downloadFileSafely(info.download_url, info.filename || "mastered.wav");
                  }
                  trackEvent("download_completed", { source: "shared_link" });
                } catch (err) {
                  setDownloadError(err?.code ? shareErrorText(t, err) : err?.message || t("shared.downloadFailed"));
                } finally {
                  setDownloading(false);
                }
              }}
              disabled={downloading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-bg transition hover:opacity-85 disabled:opacity-60"
            >
              {downloading ? (
                <>
                  <Spinner size={14} /> {t("shared.downloading")}
                </>
              ) : (
                t("shared.download")
              )}
            </button>
            {downloadError ? (
              <p role="alert" className="mt-3 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-3 py-2 text-[13px] text-red-800">
                {downloadError}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-4 text-[12px] text-text-secondary">
              <span>{remaining ? t("shared.expiresIn", { remaining }) : t("shared.aboutToExpire")}</span>
              {info.downloads_remaining != null ? <span>{t("shared.downloadsRemaining", { n: info.downloads_remaining })}</span> : null}
            </div>
          </div>
        </div>
      )}

      {!error ? (
        <Link href="/" className="text-[13px] text-text-secondary transition hover:text-text-primary">
          {t("shared.masterYourOwn")}
        </Link>
      ) : null}
    </main>
  );
}
