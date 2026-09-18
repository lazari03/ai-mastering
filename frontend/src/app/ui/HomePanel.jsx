"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getJobs } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";
import { IconMaster, IconChords, IconMyMasters } from "@/components/app/icons";

// Real tools only — no "Audio Cleaner" or standalone "BPM Detection" card,
// since neither exists as a real feature yet (BPM is already reported
// inside Chord Detection; see ExplorePanel.jsx's own comment on the same
// scope decision). Shared shape with ExplorePanel's cards, just a more
// compact rendering for this page.
function useToolItems(goToTab) {
  const { t } = useLanguage();
  return [
    { key: "master", icon: IconMaster, title: t("app.explore.master.title"), body: t("app.explore.master.body"), onClick: () => goToTab("master") },
    { key: "reference", icon: IconMaster, title: t("app.explore.reference.title"), body: t("app.explore.reference.body"), onClick: () => goToTab("master") },
    { key: "stems", icon: IconMaster, title: t("app.explore.stems.title"), body: t("app.explore.stems.body"), onClick: () => goToTab("master") },
    { key: "chords", icon: IconChords, title: t("app.explore.chords.title"), body: t("app.explore.chords.body"), onClick: () => goToTab("chords") },
    { key: "myMasters", icon: IconMyMasters, title: t("app.explore.myMasters.title"), body: t("app.explore.myMasters.body"), onClick: () => goToTab("myMasters") },
  ];
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function HomePanel({ onNavigate }) {
  const { t } = useLanguage();
  const setFile = useMasteringStore((s) => s.setFile);
  const tools = useToolItems(onNavigate);
  const [jobs, setJobs] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    getJobs()
      .then((list) => {
        if (!cancelled) setJobs(Array.isArray(list) ? list.slice(0, 4) : []);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;

  const handleFile = (file) => {
    if (!file) return;
    setFile(file, "home");
    onNavigate("master");
  };

  return (
    <div>
      <h1 className="m-0 text-2xl font-semibold text-text-primary sm:text-3xl">{t("app.home.title")}</h1>
      <p className="mt-1.5 text-sm text-text-secondary">{t("app.home.subtitle")}</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        {/* Real drag-and-drop, wired into the same masteringStore the
            Mastering tab reads from — dropping a file here and landing on
            Mastering shows it already loaded, not a dead-end upload box. */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragDepth((d) => d + 1);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragDepth((d) => Math.max(0, d - 1));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragDepth(0);
            handleFile(e.dataTransfer?.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center transition ${
            dragging ? "border-accent bg-accent/[0.05]" : "border-border-subtle"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle text-text-primary" aria-hidden="true">
            ↑
          </span>
          <p className="mt-4 text-lg font-semibold text-text-primary">{t("app.home.dropTitle")}</p>
          <p className="mt-1 text-xs text-text-secondary">{t("app.home.dropHint")}</p>
          <label className="mt-5 cursor-pointer rounded-full bg-text-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-bg hover:opacity-85">
            {t("app.home.chooseFile")}
            <input type="file" accept="audio/*,.mp3,.wav,.flac,.aiff,.aif,.m4a" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>

        <div>
          <p className="m-0 mb-2 text-sm font-semibold text-text-primary">{t("app.home.tryATool")}</p>
          <div className="flex flex-col gap-1.5">
            {tools.slice(0, 4).map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.key}
                  type="button"
                  onClick={tool.onClick}
                  className="group flex items-center gap-3 rounded-xl border border-border-subtle px-3.5 py-3 text-left transition hover:border-text-primary/30"
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{tool.title}</span>
                  <span className="text-text-secondary group-hover:text-accent" aria-hidden="true">→</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The one deliberately dark panel in this page — a promo/brand
            moment, not a page surface, same convention as a hero banner. */}
        <button
          type="button"
          onClick={() => onNavigate("explore")}
          className="flex flex-col justify-end rounded-2xl bg-dark-bg p-6 text-left"
        >
          <p className="m-0 text-[10px] uppercase tracking-[0.18em] text-dark-text-secondary">Auralith Forge</p>
          <p className="mt-2 whitespace-pre-line text-xl font-semibold leading-snug text-dark-text-primary">{t("app.home.promoTitle")}</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-dark-text-primary underline underline-offset-4">
            {t("app.home.exploreAll")} <span aria-hidden="true">→</span>
          </span>
        </button>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-text-primary">{t("app.home.recentTracks")}</h2>
          <button type="button" onClick={() => onNavigate("myMasters")} className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent">
            {t("app.home.viewAll")} <span aria-hidden="true">→</span>
          </button>
        </div>

        {jobs === null ? (
          <p className="mt-4 text-sm text-text-secondary">…</p>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">{t("app.home.noTracks")}</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                  <th className="px-4 py-2.5 font-medium">{t("app.home.col.track")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("app.home.col.type")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("app.home.col.date")}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.job_id} className="border-b border-border-subtle last:border-0 hover:bg-black/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/app?job=${job.job_id}`} className="block min-w-0 truncate font-medium text-text-primary hover:text-accent">
                        {job.original_filename || job.job_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{job.tier || "standard"}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(job.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-text-primary">{t("app.home.browseTools")}</h2>
          <button type="button" onClick={() => onNavigate("explore")} className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent">
            {t("app.home.viewAllTools")} <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                type="button"
                onClick={tool.onClick}
                className="group flex flex-col items-start rounded-xl border border-border-subtle p-4 text-left transition hover:border-text-primary/30"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle text-text-primary">
                  <Icon />
                </span>
                <p className="mt-3 text-sm font-semibold text-text-primary">{tool.title}</p>
                <span className="mt-2 text-xs text-text-secondary group-hover:text-accent">{tool.body}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
