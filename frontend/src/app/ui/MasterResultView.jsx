"use client";

import { useEffect, useState } from "react";

import ProcessingSummary from "@/components/audio/ProcessingSummary";
import MasteringDecisions from "@/components/audio/MasteringDecisions";
import { summarizeDecisions } from "@/lib/masteringDecisions";
import { downloadFileSafely, getJobDetail, toAuthedDownloadUrl } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";
import { shortenFilename } from "@/lib/format";
import { LoadingBlock } from "@/components/ui/Spinner";
import { trackEvent } from "@/lib/analytics";
import InlineAlert from "@/components/ui/InlineAlert";
import ABMasterPlayer from "@/components/audio/ABMasterPlayer";

/**
 * The dedicated post-mastering view — reached at /app?job=:jobId (a
 * query param on the app shell's one page, not a separate route — a
 * separate route was tried first and reverted: Next.js mounted a whole
 * fresh page for it, new sidebar and all, instead of the instant
 * in-place switch this needs), both right after a fresh render
 * (AppClient routes here automatically)
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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    setUrls(null);
    setLoadError("");
    setLoading(true);

    getJobDetail(jobId)
      .then(async (detail) => {
        if (cancelled) return;
        setJob(detail);
        if (!detail.expired) {
          const [originalUrl, masteredUrl, previewUrl] = await Promise.all([
            toAuthedDownloadUrl(`/original/${detail.job_id}`),
            toAuthedDownloadUrl(`/download/${detail.job_id}.${detail.output_format || "wav"}`),
            // Always 16-bit PCM WAV, purely for the on-page player below —
            // see backend's /preview route. masteredUrl (the real
            // deliverable, at its actual bit depth) stays what the
            // Download button uses.
            toAuthedDownloadUrl(`/preview/${detail.job_id}`),
          ]);
          if (!cancelled) setUrls({ originalUrl, masteredUrl, previewUrl });
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
      <div className="mx-auto flex w-full max-w-[1040px] justify-center py-16">
        <LoadingBlock />
      </div>
    );
  }

  if (loadError || !job) {
    return (
      <div className="mx-auto w-full max-w-[1040px] py-16 text-center">
        <h1 className="m-0 text-2xl">{t("result.loadFailed")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{loadError || t("result.notFound")}</p>
        <button
          type="button"
          onClick={onViewAllMasters}
          className="mt-5 rounded-lg border border-border-subtle bg-black/[0.045] px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30"
        >
          {t("result.backToMasters")}
        </button>
      </div>
    );
  }

  const applied = job.processing_applied || {};
  const target = job.target_profile_used || {};
  const abMatch = job.ab_gain_match || {};
  // Both loudness-match gains go to the player at once — ABMasterPlayer
  // plays both versions in sync and Before/After is a gain crossfade, so
  // neither side sounds "better" just because it's louder.
  const beforeGainDb = abMatch.before_gain_db || 0;
  const afterGainDb = abMatch.after_gain_db || 0;
  // toAuthedDownloadUrl always returns a non-empty string (it just signs a
  // URL, it never checks the resource actually exists), so a plain ||
  // fallback here could never catch a previewUrl that 404s — only a
  // genuinely missing field. The real fallback happens at the player
  // itself (see ABMasterPlayer's afterFallbackSrc): if the
  // 16-bit preview copy 404s (an older job, or a rare failed transcode —
  // the backend now regenerates it lazily, but this covers the rest), the
  // player swaps to masteredUrl automatically instead of "After" just
  // silently not playing.
  const afterSrc = urls ? urls.previewUrl || urls.masteredUrl : null;
  const afterFallbackSrc = urls ? urls.masteredUrl : null;
  const beforeSrc = urls ? urls.originalUrl : null;

  // Real before/after measurements from this job, when the engine recorded them.
  const num = (v) => (Number.isFinite(v) ? v.toFixed(1) : null);
  const stats = [
    { label: t("hero.demo.loudness"), before: num(job.before_lufs ?? job.analysis_before?.integrated_lufs), after: num(job.after_lufs ?? job.analysis_after?.integrated_lufs), unit: "LUFS" },
    { label: t("hero.demo.truePeak"), before: num(job.analysis_before?.true_peak_db), after: num(job.analysis_after?.true_peak_db), unit: "dBTP" },
    { label: t("lufsMeter.rangeLabel"), before: num(job.analysis_before?.loudness_range_lu), after: num(job.analysis_after?.loudness_range_lu), unit: "LU" },
  ]
    .filter((s) => s.before !== null && s.after !== null)
    .map((s) => ({ ...s, value: `${s.before} → ${s.after}` }));

  const handleDownload = async () => {
    if (!urls) return;
    setDownloadError("");
    setDownloading(true);
    try {
      await downloadFileSafely(urls.masteredUrl, `mastered_${job.job_id}.${job.output_format || "wav"}`);
      trackEvent("download_completed", { source: "result_view" });
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
      <div className="mx-auto w-full max-w-[1040px] py-16 text-center">
        <h1 className="m-0 text-2xl">{t("result.expiredTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{t("result.expiredBody")}</p>
        <div className="mt-6">
          <ProcessingSummary result={job} />
        </div>
        <button
          type="button"
          onClick={onViewAllMasters}
          className="mt-6 rounded-lg border border-border-subtle bg-black/[0.045] px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30"
        >
          {t("result.backToMasters")}
        </button>
      </div>
    );
  }

  return (
    <div className="reveal mx-auto w-full max-w-[1040px]">
      {/* Always-visible, not buried below the player/download buttons —
          this is what actually gets someone back to the list from a deep
          link or an old habit of reaching for a "back" affordance instead
          of the sidebar (which also works now, see AppClient.jsx's
          goToTab). */}
      <button
        type="button"
        onClick={onViewAllMasters}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
      >
        ← {t("result.backToMasters")}
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-[0.2em] text-accent">{t("result.eyebrow")}</p>
          <h1 className="m-0 mt-1 text-[22px] sm:text-[26px]">{t("result.title")}</h1>
          {job.original_filename ? (
            // Shortened at the JS level (not just CSS truncate) so the
            // extension and trailing part of a long filename stay visible
            // instead of being clipped off blind — see lib/format.js. Full
            // name is still one hover/long-press away via title=.
            <p className="mt-1 truncate text-sm text-text-secondary" title={job.original_filename}>
              {shortenFilename(job.original_filename)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {target.genre ? <span className="rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-1.5 text-xs capitalize">{target.genre}</span> : null}
          {target.category ? (
            <span className="rounded-lg border border-border-subtle bg-accent/10 px-3 py-1.5 text-xs capitalize text-accent">
              {target.category.replaceAll("_", " ")}
              {target.flavour ? ` · ${target.flavour}` : ""}
            </span>
          ) : null}
          {applied.tier ? <span className="rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-1.5 text-xs uppercase tracking-[0.08em]">{applied.tier}</span> : null}
        </div>
      </div>

      <div className="glass-panel rounded-[20px] p-3 sm:p-4">
        {beforeSrc && afterSrc ? (
          <ABMasterPlayer
            beforeSrc={beforeSrc}
            afterSrc={afterSrc}
            afterFallbackSrc={afterFallbackSrc}
            beforeGainDb={beforeGainDb}
            afterGainDb={afterGainDb}
            beforeLabel={t("result.before")}
            afterLabel={t("result.after")}
            preparingLabel={t("result.preparingAb")}
            onModeChange={(m) => trackEvent(m === "before" ? "original_played" : "mastered_played", { source: "result_view" })}
          />
        ) : null}

        {stats.length ? (
          <dl className="m-0 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-black/[0.03] px-4 py-3">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">{stat.label}</dt>
                <dd className="m-0 mt-1 font-mono text-[13px] text-text-primary">
                  {stat.value}
                  <span className="text-text-secondary"> {stat.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/* Full-width stacked on mobile (easier to tap, no cramped
            3-buttons-squeezed-into-one-row), a flexible row from sm: up —
            replaces a fixed min-w-[200px] that used to force wrapping at
            arbitrary widths regardless of the actual viewport. */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !urls}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-text-primary px-6 py-3 text-[13px] font-semibold text-bg transition-transform duration-200 active:scale-[0.98] disabled:opacity-50 sm:w-auto"
          >
            <span aria-hidden="true">↓</span>
            {downloading ? t("console.downloading") : t("console.downloadMaster")}
            {job.output_format ? <span className="font-mono text-[11px] uppercase opacity-60">{job.output_format}</span> : null}
          </button>
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={handleMasterAnother}
              className="flex-1 rounded-full px-5 py-3 text-[13px] font-medium text-text-primary ring-1 ring-inset ring-black/[0.1] transition hover:bg-black/[0.04] sm:flex-none"
            >
              {t("result.masterAnother")}
            </button>
            <button
              type="button"
              onClick={onViewAllMasters}
              className="flex-1 rounded-full px-5 py-3 text-[13px] font-medium text-text-secondary transition hover:bg-black/[0.04] hover:text-text-primary sm:flex-none"
            >
              {t("result.viewAllMasters")}
            </button>
          </div>
        </div>
        {downloadError ? <InlineAlert size="xs" className="mt-2">{downloadError}</InlineAlert> : null}

        {(job.source_warnings || []).map((warning) => (
          <p key={warning} className="m-0 mt-3 flex gap-2.5 rounded-xl bg-amber-400/[0.08] px-4 py-3 text-[12px] leading-relaxed text-amber-900">
            <span aria-hidden="true" className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            {warning}
          </p>
        ))}
      </div>

      {/* Engine decisions first (what was corrected, what was preserved,
          how it verified); the raw processing numbers stay below for
          anyone who wants them, and are all older jobs have. */}
      <div className="mt-6">
        <MasteringDecisions result={job} source="result_view" />
      </div>

      <div className="mt-6">
        <h2 className="m-0 mb-3 text-base">{t(summarizeDecisions(job) ? "result.technicalHeading" : "result.detailsHeading")}</h2>
        <div className="glass-panel rounded-[20px] p-4 sm:p-[22px]">
          <ProcessingSummary result={job} />
        </div>
      </div>
    </div>
  );
}
