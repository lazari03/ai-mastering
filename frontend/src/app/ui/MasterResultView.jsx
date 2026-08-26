"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";

import ProcessingSummary from "@/components/audio/ProcessingSummary";
import { downloadFileSafely } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";

// three.js + its postprocessing passes are real weight (~250KB+) that only
// matters once someone actually finishes a master — dynamic + ssr:false
// keeps it out of the initial /app bundle (and out of any server render,
// since it touches window/AudioContext/WebGL) for the common case of just
// uploading/configuring on the Master tab.
const WebGLMasterPreview = dynamic(() => import("@/components/audio/WebGLMasterPreview"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-2xl border border-white/10 bg-black/40 sm:h-80" />,
});

/**
 * The dedicated post-mastering page — replaces the old "jump straight to
 * My Masters" behavior for a real (non-preview) render. AppClient routes
 * here via activeTab === "result" once a real master lands; this reads
 * the finished result straight from the store rather than taking it as a
 * prop, same pattern every other tab panel in this app already uses.
 */
export default function MasterResultView({ onMasterAnother, onViewAllMasters }) {
  const { t } = useLanguage();
  const { result, file, clearResult } = useMasteringStore();
  const [previewMode, setPreviewMode] = useState("after");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const switchLock = useRef(false);

  if (!result) return null;

  const applied = result.processing_applied || {};
  const target = result.target_profile_used || {};
  const abMatch = result.ab_gain_match || {};
  const gainDb = previewMode === "after" ? abMatch.after_gain_db || 0 : abMatch.before_gain_db || 0;
  const previewSrc = previewMode === "after" ? result.masteredUrl : result.originalUrl;

  const switchPreview = (mode) => {
    if (switchLock.current) return;
    switchLock.current = true;
    setPreviewMode(mode);
    window.setTimeout(() => {
      switchLock.current = false;
    }, 150);
  };

  const handleDownload = async () => {
    setDownloadError("");
    setDownloading(true);
    try {
      const ext = result.download_url?.split(".").pop() || "wav";
      await downloadFileSafely(result.masteredUrl, `mastered_${result.job_id}.${ext}`);
    } catch (err) {
      setDownloadError(err?.message || t("console.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const handleMasterAnother = () => {
    clearResult();
    onMasterAnother?.();
  };

  return (
    <div className="reveal mx-auto w-full max-w-[880px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[0.2em] text-brass">{t("result.eyebrow")}</p>
          <h1 className="m-0 mt-1 font-[var(--font-title)] text-[26px]">{t("result.title")}</h1>
          {file?.name ? <p className="mt-1 truncate text-sm text-zinc-400">{file.name}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {target.genre ? <span className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs capitalize">{target.genre}</span> : null}
          {target.category ? (
            <span className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-xs capitalize text-brass">
              {target.category.replaceAll("_", " ")}
              {target.flavour ? ` · ${target.flavour}` : ""}
            </span>
          ) : null}
          {applied.tier ? <span className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs uppercase tracking-[0.08em]">{applied.tier}</span> : null}
        </div>
      </div>

      <div className="glass-panel rounded-[20px] p-[22px]">
        <div className="mb-4 flex items-center justify-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => switchPreview("before")}
            className={`flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-[0.1em] transition ${
              previewMode === "before" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t("result.before")}
          </button>
          <button
            type="button"
            onClick={() => switchPreview("after")}
            className={`flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-[0.1em] transition ${
              previewMode === "after" ? "bg-gradient-to-r from-ember to-brass text-black" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t("result.after")}
          </button>
        </div>

        <WebGLMasterPreview src={previewSrc} gainDb={gainDb} />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex flex-1 min-w-[200px] justify-center rounded-lg border border-brass/40 bg-brass/[0.18] px-4 py-3 text-xs uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
          >
            {downloading ? t("console.downloading") : t("console.downloadMaster")}
          </button>
          <button
            type="button"
            onClick={handleMasterAnother}
            className="inline-flex flex-1 min-w-[200px] justify-center rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
          >
            {t("result.masterAnother")}
          </button>
          <button
            type="button"
            onClick={onViewAllMasters}
            className="inline-flex flex-1 min-w-[200px] justify-center rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
          >
            {t("result.viewAllMasters")}
          </button>
        </div>
        {downloadError ? <p className="mt-2 text-xs text-red-300">⚠ {downloadError}</p> : null}

        {(result.source_warnings || []).map((warning) => (
          <div key={warning} className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            ⚠ {warning}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="m-0 mb-3 font-[var(--font-title)] text-base">{t("result.detailsHeading")}</h2>
        <div className="glass-panel rounded-[20px] p-[22px]">
          <ProcessingSummary result={result} />
        </div>
      </div>
    </div>
  );
}
