"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import LogoMark from "@/components/brand/LogoMark";
import { getSharedJobInfo, downloadFileSafely } from "@/network/http/client";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

function formatExpiry(t, iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return t("shared.minutes", { n: Math.max(1, Math.floor(ms / 60000)) });
  return t("shared.hours", { n: hours, s: hours === 1 ? "" : "s" });
}

// Deliberately simple — this is a public page a non-account-holder lands
// on from a share link, not another app tab. One job's worth of info, one
// download button, nothing else. A fresh link (new token) is minted every
// time someone shares a track — this page doesn't know or care whether
// it's the first person to open this exact link or the tenth.
export default function SharedMasterClient({ jobId, token }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!token) {
      setError(t("shared.missingToken"));
      return;
    }
    getSharedJobInfo(jobId, token)
      .then(setInfo)
      .catch((err) => setError(err?.message || t("shared.invalidOrExpired")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, token]);

  const remaining = info ? formatExpiry(t, info.expires_at) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0b0d10] px-6 text-center text-white">
      <Link href="/" className="flex items-center gap-2">
        <LogoMark size={26} />
        <span className="font-[var(--font-title)] text-xs uppercase tracking-[0.18em] text-brass">Auralith Forge</span>
      </Link>

      {error ? (
        <>
          <h1 className="m-0 font-[var(--font-title)] text-2xl">{t("shared.linkUnavailable")}</h1>
          <p className="m-0 max-w-sm text-sm text-zinc-400">{error}</p>
        </>
      ) : !info ? (
        <LoadingBlock />
      ) : (
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/20 p-6">
          <p className="m-0 text-xs uppercase tracking-[0.14em] text-brass">{t("shared.sharedMaster")}</p>
          <p className="mt-2 truncate text-lg font-semibold text-white">{info.filename}</p>
          {info.before_lufs != null && info.after_lufs != null ? (
            <p className="mt-1 text-xs text-zinc-500">
              {info.before_lufs} → {info.after_lufs} LUFS
            </p>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              setDownloadError("");
              setDownloading(true);
              try {
                await downloadFileSafely(info.download_url, info.filename || "mastered.wav");
              } catch (err) {
                setDownloadError(err?.message || t("shared.downloadFailed"));
              } finally {
                setDownloading(false);
              }
            }}
            disabled={downloading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ember px-5 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#100b08] transition hover:brightness-110 disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Spinner size={14} /> {t("shared.downloading")}
              </>
            ) : (
              t("shared.download")
            )}
          </button>
          {downloadError ? <p className="mt-2 text-xs text-red-300">⚠ {downloadError}</p> : null}

          <p className="mt-3 text-[11px] text-zinc-500">
            {remaining ? t("shared.expiresIn", { remaining }) : t("shared.aboutToExpire")}
          </p>
        </div>
      )}

      <p className="text-[11px] text-zinc-600">
        <Link href="/" className="hover:text-zinc-400">
          {t("shared.masterYourOwn")}
        </Link>
      </p>
    </main>
  );
}
