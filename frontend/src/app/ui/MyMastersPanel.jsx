"use client";

import { useEffect, useState } from "react";

import { getJobs, toAuthedDownloadUrl, deleteJobRecord, postShareJob, downloadFileSafely } from "@/network/http/client";
import { useEntitlementsStore, planUnlocksChordsAndShare } from "@/store/entitlementsStore";

function timeUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}m left`;
  return `${hours}h left`;
}

export default function MyMastersPanel() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  const [busyJobId, setBusyJobId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [shareLinks, setShareLinks] = useState({}); // job_id -> { url, expires_at }
  const [shareErrors, setShareErrors] = useState({});
  const [copiedJobId, setCopiedJobId] = useState("");
  const [downloadErrors, setDownloadErrors] = useState({});

  const { plan } = useEntitlementsStore();
  const shareUnlocked = planUnlocksChordsAndShare(plan);

  useEffect(() => {
    getJobs()
      .then(async (list) => {
        // Built once per job here (not per-render, and not via a raw
        // toAbsoluteUrl) — these routes need the ?dl= token to work at all
        // from a plain <a href>, see toAuthedDownloadUrl's own comment.
        const enriched = await Promise.all(
          list.map(async (job) => ({
            ...job,
            originalUrl: await toAuthedDownloadUrl(`/original/${job.job_id}`),
            downloadUrl: await toAuthedDownloadUrl(`/download/${job.job_id}.${job.output_format || "wav"}`),
          }))
        );
        setJobs(enriched);
      })
      .catch((err) => setError(err?.message || "Failed to load history"));
  }, []);

  const handleDelete = async (jobId) => {
    setBusyJobId(jobId);
    try {
      await deleteJobRecord(jobId);
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
      setConfirmDeleteId("");
    } catch (err) {
      setError(err?.message || "Failed to delete");
    } finally {
      setBusyJobId("");
    }
  };

  const handleShare = async (jobId) => {
    if (!shareUnlocked) return;
    setBusyJobId(jobId);
    setShareErrors((prev) => ({ ...prev, [jobId]: "" }));
    try {
      const { url, expires_at } = await postShareJob(jobId);
      setShareLinks((prev) => ({ ...prev, [jobId]: { url, expires_at } }));
    } catch (err) {
      setShareErrors((prev) => ({ ...prev, [jobId]: err?.message || "Failed to create share link" }));
    } finally {
      setBusyJobId("");
    }
  };

  const handleDownload = async (job) => {
    setBusyJobId(job.job_id);
    setDownloadErrors((prev) => ({ ...prev, [job.job_id]: "" }));
    try {
      await downloadFileSafely(job.downloadUrl, `mastered_${job.job_id}.${job.output_format || "wav"}`);
    } catch (err) {
      setDownloadErrors((prev) => ({ ...prev, [job.job_id]: err?.message || "Download failed" }));
    } finally {
      setBusyJobId("");
    }
  };

  const copyShareLink = async (jobId, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedJobId(jobId);
      setTimeout(() => setCopiedJobId(""), 2000);
    } catch {
      // Clipboard API unavailable (non-HTTPS, permissions) — the link is
      // still visible and selectable in the box, just not one-click.
    }
  };

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">My Masters</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        Your last 25 renders. Files are removed 48 hours after creation — download what you need before then.
      </p>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {jobs === null && !error ? <p className="mt-4 text-xs text-zinc-400">Loading…</p> : null}
      {jobs?.length === 0 ? <p className="mt-4 text-xs text-zinc-400">No renders yet — master a track to see it here.</p> : null}

      <div className="mt-5 flex flex-col gap-3">
        {jobs?.map((job) => {
          const expiry = timeUntil(job.expires_at);
          const expired = expiry === "expired";
          const share = shareLinks[job.job_id];
          const isBusy = busyJobId === job.job_id;
          return (
            <div key={job.job_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold text-white">{job.original_filename || job.job_id}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {job.genre || "custom"} · {job.tier || "standard"} ·{" "}
                    {job.created_at ? new Date(job.created_at).toLocaleString() : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] ${expired ? "border-red-400/30 text-red-300" : "border-white/15 text-zinc-400"}`}>
                  {expired ? "expired" : expiry}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg border border-white/10 px-2.5 py-1 text-zinc-300">
                  {job.before_lufs} → {job.after_lufs} LUFS
                </span>
              </div>

              {!expired ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={job.originalUrl}
                    className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30"
                  >
                    Original
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDownload(job)}
                    disabled={isBusy}
                    className="rounded-lg border border-brass/40 bg-brass/[0.15] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                  >
                    {isBusy ? "…" : "Download"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(job.job_id)}
                    disabled={isBusy || !shareUnlocked}
                    title={shareUnlocked ? undefined : "Share links are an All-Access feature"}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30 disabled:opacity-50"
                  >
                    {isBusy ? "…" : "Share"}
                    {!shareUnlocked ? (
                      <span className="rounded-full border border-brass/40 bg-brass/[0.12] px-1.5 py-0.5 text-[9px] normal-case text-brass">
                        All-Access
                      </span>
                    ) : null}
                  </button>
                  {confirmDeleteId === job.job_id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(job.job_id)}
                        disabled={isBusy}
                        className="rounded-lg border border-red-400/50 bg-red-500/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-red-200 disabled:opacity-50"
                      >
                        {isBusy ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId("")}
                        className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(job.job_id)}
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-red-300 hover:border-red-400/50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ) : null}

              {shareErrors[job.job_id] ? <p className="mt-2 text-xs text-red-300">{shareErrors[job.job_id]}</p> : null}
              {downloadErrors[job.job_id] ? <p className="mt-2 text-xs text-red-300">⚠ {downloadErrors[job.job_id]}</p> : null}

              {share ? (
                <div className="mt-3 rounded-xl border border-brass/25 bg-brass/[0.06] p-3">
                  <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-brass">Share link — no sign-in needed</p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Anyone with this link can play or download just this file. It stops working once the file expires
                    ({timeUntil(share.expires_at)}) — same as everything else here, nothing is stored longer than that.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={share.url}
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-[11px] text-zinc-200"
                    />
                    <button
                      type="button"
                      onClick={() => copyShareLink(job.job_id, share.url)}
                      className="shrink-0 rounded-lg border border-brass/40 bg-brass/[0.18] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25"
                    >
                      {copiedJobId === job.job_id ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
