"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import ProcessingSummary from "@/components/audio/ProcessingSummary";
import { downloadFileSafely, getJobDetail, toAuthedDownloadUrl } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui/Spinner";

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
 * The dedicated post-mastering page — reached at /app/masters/:jobId,
 * both right after a fresh render (AppClient routes here automatically)
 * and when reopening an older still-valid master from My Masters. Always
 * fetches by job_id rather than reading in-memory store state, on
 * purpose: that's what makes a page refresh not lose the data, and what
 * makes it work identically for a master rendered five minutes ago or
 * five hours ago (recordJob() on the backend already persisted
 * everything this needs by the time /master's response comes back — see
 * masteringRoutes.js). GET /jobs/:jobId is auth-gated (server.js's global
 * requireAuth) and scoped to the caller's own jobs subcollection
 * (jobsService.js's getJob/getJobDetail) — a job_id that isn't this
 * user's own 404s exactly like a missing one, existence isn't leaked.
 */
export default function MasterResultView({ jobId, onMasterAnother, onViewAllMasters }) {
  const { t } = useLanguage();
  const clearResult = useMasteringStore((s) => s.clearResult);
  const [job, setJob] = useState(null);
  const [urls, setUrls] = useState(null); // { originalUrl, masteredUrl }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [previewMode, setPreviewMode] = useState("after");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const switchLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    setUrls(null);
    setLoadError("");
    setLoading(true);
    setPreviewMode("after");

    getJobDetail(jobId)
      .then(async (detail) => {
        if (cancelled) return;
        setJob(detail);
        if (!detail.expired) {
          const [originalUrl, masteredUrl] = await Promise.all([
            toAuthedDownloadUrl(`/original/${detail.job_id}`),
            toAuthedDownloadUrl(`/download/${detail.job_id}.${detail.output_format || "wav"}`),
          ]);
          if (!cancelled) setUrls({ originalUrl, masteredUrl });
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || t("result.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] justify-center py-16">
        <LoadingBlock />
      </div>
    );
  }

  if (loadError || !job) {
    return (
      <div className="mx-auto w-full max-w-[880px] py-16 text-center">
        <h1 className="m-0 font-[var(--font-title)] text-2xl">{t("result.loadFailed")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{loadError || t("result.notFound")}</p>
        <button
          type="button"
          onClick={onViewAllMasters}
          className="mt-5 rounded-lg border border-white/15 bg-black/20 px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
        >
          {t("result.backToMasters")}
        </button>
      </div>
    );
  }

  const applied = job.processing_applied || {};
  const target = job.target_profile_used || {};
  const abMatch = job.ab_gain_match || {};
  const gainDb = previewMode === "after" ? abMatch.after_gain_db || 0 : abMatch.before_gain_db || 0;
  const previewSrc = urls ? (previewMode === "after" ? urls.masteredUrl : urls.originalUrl) : null;

  const switchPreview = (mode) => {
    if (switchLock.current) return;
    switchLock.current = true;
    setPreviewMode(mode);
    window.setTimeout(() => {
      switchLock.current = false;
    }, 150);
  };

  const handleDownload = async () => {
    if (!urls) return;
    setDownloadError("");
    setDownloading(true);
    try {
      await downloadFileSafely(urls.masteredUrl, `mastered_${job.job_id}.${job.output_format || "wav"}`);
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

  if (job.expired) {
    return (
      <div className="mx-auto w-full max-w-[880px] py-16 text-center">
        <h1 className="m-0 font-[var(--font-title)] text-2xl">{t("result.expiredTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{t("result.expiredBody")}</p>
        <div className="mt-6">
          <ProcessingSummary result={job} />
        </div>
        <button
          type="button"
          onClick={onViewAllMasters}
          className="mt-6 rounded-lg border border-white/15 bg-black/20 px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
        >
          {t("result.backToMasters")}
        </button>
      </div>
    );
  }

  return (
    <div className="reveal mx-auto w-full max-w-[880px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[0.2em] text-brass">{t("result.eyebrow")}</p>
          <h1 className="m-0 mt-1 font-[var(--font-title)] text-[26px]">{t("result.title")}</h1>
          {job.original_filename ? <p className="mt-1 truncate text-sm text-zinc-400">{job.original_filename}</p> : null}
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

        {previewSrc ? <WebGLMasterPreview src={previewSrc} gainDb={gainDb} /> : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !urls}
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

        {(job.source_warnings || []).map((warning) => (
          <div key={warning} className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            ⚠ {warning}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="m-0 mb-3 font-[var(--font-title)] text-base">{t("result.detailsHeading")}</h2>
        <div className="glass-panel rounded-[20px] p-[22px]">
          <ProcessingSummary result={job} />
        </div>
      </div>
    </div>
  );
}
