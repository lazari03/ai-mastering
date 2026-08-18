"use client";

import { useEffect, useState } from "react";

import { getJobs, getOriginalUrl, toAbsoluteUrl } from "@/network/http/client";

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

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch((err) => setError(err?.message || "Failed to load history"));
  }, []);

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
                    href={getOriginalUrl(job.job_id)}
                    className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30"
                  >
                    Original
                  </a>
                  <a
                    href={toAbsoluteUrl(`/download/${job.job_id}.${job.output_format || "wav"}`)}
                    download
                    className="rounded-lg border border-brass/40 bg-brass/[0.15] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25"
                  >
                    Download Master
                  </a>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
