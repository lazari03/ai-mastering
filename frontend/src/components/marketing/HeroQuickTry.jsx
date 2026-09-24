"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import FileDropzone from "@/components/ui/FileDropzone";
import LufsMeterResult from "@/components/audio/LufsMeterResult";
import ChordAuthGate from "@/components/audio/ChordAuthGate";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { postAnalyzeAudio } from "@/network/http/client";
import { stashPendingToolFile } from "@/lib/toolHandoff";
import { trackEvent } from "@/lib/analytics";
import { uploadStatusText } from "@/lib/uploadProgress";
import { CTA } from "@/lib/internalLinks";
import { useLanguage } from "@/lib/i18n";
import { DEMO_MASTER } from "@/content/demoMaster";

const SAMPLE_SRC = `/audio/demos/${DEMO_MASTER.track}`;

/**
 * The homepage hero's "try it now" panel — the first thing a visitor can
 * act on without an account. Same anonymous /analyze flow as
 * PublicLufsMeter.jsx (the real analysis Studio runs on every upload),
 * with two differences that exist purely to lower the cost of a first try:
 *
 *  - Choosing a file starts the analysis — no separate "Measure" click.
 *  - "Try it with our sample" runs that same analysis on the homepage's
 *    own demo source, so someone without a bounce on hand still gets a
 *    real result (and the before/after player next to it is that same
 *    track, mastered).
 *
 * ensureAnonymous() is deferred to the first try rather than run on mount
 * (as the tool pages do) — the homepage is the highest-traffic page, and
 * minting an anonymous Firebase user for every visitor who only reads is
 * pure waste.
 */
export default function HeroQuickTry() {
  const { t } = useLanguage();
  const router = useRouter();
  const setMasteringFile = useMasteringStore((s) => s.setFile);
  const [file, setFile] = useState(null);
  const [input, setInput] = useState(null); // "upload" | "sample"
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState("");
  const [showGate, setShowGate] = useState(false);
  // A file dropped while the sample is still analyzing must win — only the
  // latest try may write results.
  const latestRun = useRef(0);

  const run = async (nextFile, source) => {
    const runId = ++latestRun.current;
    setFile(nextFile);
    setInput(source);
    setAnalysis(null);
    setError("");
    setIsLoading(true);
    try {
      await useAuthStore.getState().ensureAnonymous();
      const formData = new FormData();
      formData.append("file", nextFile);
      const response = await postAnalyzeAudio(formData, {
        onUploadProgress: (p) => runId === latestRun.current && setUpload(p),
      });
      if (runId !== latestRun.current) return;
      setAnalysis(response.analysis);
      trackEvent("free_tool_analysis_completed", { source_tool: "homepage_hero", input: source });
    } catch (err) {
      if (runId === latestRun.current) setError(err?.message || t("lufsMeter.failed"));
    } finally {
      if (runId === latestRun.current) {
        setIsLoading(false);
        setUpload(null);
      }
    }
  };

  const trySample = async () => {
    trackEvent("cta_click", { cta_id: "try_sample", location: "homepage_hero" });
    setIsLoading(true);
    setError("");
    const startedAt = latestRun.current;
    try {
      const res = await fetch(SAMPLE_SRC);
      if (!res.ok) throw new Error(t("heroTry.sampleFailed"));
      const blob = await res.blob();
      if (startedAt !== latestRun.current) return; // a real upload started meanwhile
      await run(new File([blob], DEMO_MASTER.track, { type: blob.type || "audio/mpeg" }), "sample");
    } catch (err) {
      if (startedAt !== latestRun.current) return;
      setError(err?.message || t("heroTry.sampleFailed"));
      setIsLoading(false);
    }
  };

  const masterThisTrack = () => {
    trackEvent("free_tool_master_cta_clicked", { source_tool: "homepage_hero", input });
    const { user } = useAuthStore.getState();
    if (user && !user.isAnonymous) {
      setMasteringFile(file, "homepage_hero");
      router.push("/app?tab=master");
      return;
    }
    setShowGate(true);
  };

  const reset = () => {
    setFile(null);
    setInput(null);
    setAnalysis(null);
    setError("");
  };

  return (
    <div className="bezel bezel-on-dark relative z-10 mt-7 max-w-[560px] sm:mt-9">
      <div className="bezel-core p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="m-0 text-[15px] font-semibold text-text-primary">{t("heroTry.title")}</p>
          <p className="m-0 text-[12px] font-medium text-accent">{t("heroTry.noSignup")}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={trySample}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full bg-black/[0.055] px-4 py-2 text-[13px] font-semibold text-text-primary transition hover:bg-black/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">▶</span>
            {t("heroTry.sample")}
          </button>
          {isLoading ? (
            <span className="inline-flex items-center gap-2 text-[12px] text-text-secondary" role="status">
              <Spinner size={13} /> {uploadStatusText(t, upload, t("lufsMeter.analyzing"))}
            </span>
          ) : (
            <span className="text-[12px] text-text-secondary">{t("heroTry.hint")}</span>
          )}
        </div>

        <div className="mt-3">
          <FileDropzone
            id="heroQuickTryInput"
            fileName={input === "upload" ? file?.name : null}
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) run(next, "upload");
            }}
            onRemove={reset}
          />
        </div>

        {error ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-4 py-3 text-sm text-red-800">
            <span>{error}</span>
            {file ? (
              <button type="button" onClick={() => run(file, input)} className="btn-secondary btn-sm">
                {t("chordDetector.tryAgain")}
              </button>
            ) : null}
          </div>
        ) : null}

        <LufsMeterResult analysis={analysis} />

        {analysis && input === "sample" ? (
          <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-[13px] leading-relaxed text-text-primary">
            {t("heroTry.sampleAfter", {
              before: DEMO_MASTER.before_lufs.toFixed(1),
              after: DEMO_MASTER.after_lufs.toFixed(1),
            })}{" "}
            <a href="#hero-player" className="font-semibold underline decoration-black/20 underline-offset-4 hover:text-accent">
              {t("heroTry.sampleListen")}
            </a>
            <p className="m-0 mt-2 text-text-secondary">{t("heroTry.sampleNext")}</p>
          </div>
        ) : null}

        {analysis && input === "upload" ? (
          <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-center">
            <button
              type="button"
              onClick={masterThisTrack}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-bg transition hover:opacity-85"
            >
              {t("lufsMeter.masterThisTrack")}
            </button>
            <p className="mt-2 text-[11px] text-text-secondary">{t("lufsMeter.sameFileNote")}</p>
          </div>
        ) : null}

        <p className="m-0 mt-4 text-[12px] text-text-secondary">
          {t("heroTry.masterLead")}{" "}
          <Link
            href={CTA.signup}
            onClick={() => trackEvent("cta_click", { cta_id: "master_a_track_free", location: "homepage_hero" })}
            className="font-semibold text-text-primary underline decoration-black/20 underline-offset-4 hover:text-accent"
          >
            {t("hero.ctaPrimary")}
          </Link>{" "}
          · {t("hero.ctaReassurance")}
        </p>
      </div>

      {showGate ? (
        <ChordAuthGate
          eyebrowKey="lufsGate.eyebrow"
          titleKey="lufsGate.title"
          bodyKey="lufsGate.body"
          onDone={async () => {
            await stashPendingToolFile(file);
            router.push("/app?tab=master");
          }}
        />
      ) : null}
    </div>
  );
}
