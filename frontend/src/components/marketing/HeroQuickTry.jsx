"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import FileDropzone from "@/components/ui/FileDropzone";
import LufsMeterResult from "@/components/audio/LufsMeterResult";
import ChordAuthGate from "@/components/audio/ChordAuthGate";
import PublicPreviewPlayer from "@/components/marketing/PublicPreviewPlayer";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { postAnalyzeAudio, postPublicPreview, apiUrl } from "@/network/http/client";
import { stashPendingToolFile, takePendingToolFile } from "@/lib/toolHandoff";
import { measureFileLocally, LocalMeasureUnavailable, SilentAudioError } from "@/lib/localLoudness";
import { trackEvent } from "@/lib/analytics";
import { uploadStatusText } from "@/lib/uploadProgress";
import { CTA } from "@/lib/internalLinks";
import { useLanguage } from "@/lib/i18n";
import { DEMO_MASTER } from "@/content/demoMaster";

/**
 * The homepage hero's "try it now" panel — the first thing a visitor can
 * act on without an account. Same anonymous /analyze flow as
 * PublicLufsMeter.jsx (the real analysis Studio runs on every upload),
 * with two differences that exist purely to lower the cost of a first try:
 *
 *  - Choosing a file starts the analysis — no separate "Measure" click.
 *  - "Try it with our sample" shows the engine's stored analysis of the
 *    homepage's own demo source (DEMO_MASTER), so someone without a bounce
 *    on hand gets a real result instantly, signed in or not (and the
 *    before/after player next to it is that same track, mastered).
 *
 * An uploaded file is measured in the browser (lib/localLoudness.js), so it
 * needs no account either. A signed-out visitor who wants to hear it
 * mastered gets a free 30 s preview of their OWN track right here
 * (POST /public/preview — no account, IP-limited), with a loudness-matched
 * before/after; the account is asked for only after that, to get the full
 * master. A file the browser can't measure skips the meter and goes
 * straight to that preview. Signed-in visitors are handed to the Master tab
 * (same file, no re-upload).
 */
export default function HeroQuickTry() {
  const { t } = useLanguage();
  const router = useRouter();
  const setMasteringFile = useMasteringStore((s) => s.setFile);
  const authUser = useAuthStore((s) => s.user);
  const signedIn = Boolean(authUser) && !authUser.isAnonymous;
  const [file, setFile] = useState(null);
  const [input, setInput] = useState(null); // "upload" | "sample"
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState("");
  const [gate, setGate] = useState(null); // null | { kind: "master" }
  const [method, setMethod] = useState(null); // "browser" | "server" — which meter produced `analysis`
  // Signed-out preview of the visitor's own track (POST /public/preview).
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewUpload, setPreviewUpload] = useState(null);
  // The browser couldn't decode the file, so there's no meter reading —
  // the preview (server-side decode) is still available.
  const [serverOnly, setServerOnly] = useState(false);
  // A file dropped while the sample is still analyzing must win — only the
  // latest try may write results.
  const latestRun = useRef(0);

  const run = async (nextFile, source) => {
    // Bumped first, so an older run can't overwrite a track the visitor
    // picked meanwhile.
    const runId = ++latestRun.current;
    setFile(nextFile);
    setInput(source);
    setAnalysis(null);
    setPreview(null);
    setServerOnly(false);
    setError("");
    setIsLoading(true);

    // In-browser measurement first: no account, no upload (localLoudness.js).
    try {
      const local = await measureFileLocally(nextFile);
      if (runId !== latestRun.current) return;
      setAnalysis(local);
      setMethod("browser");
      setIsLoading(false);
      trackEvent("free_tool_analysis_completed", { source_tool: "homepage_hero", input: source, method: "browser" });
      return;
    } catch (err) {
      if (runId !== latestRun.current) return;
      if (!(err instanceof LocalMeasureUnavailable)) {
        setError(err instanceof SilentAudioError ? t("lufsMeter.silent") : err?.message || t("lufsMeter.failed"));
        setIsLoading(false);
        return;
      }
      // The browser can't decode this file: the server can, for an account.
    }

    const { user } = useAuthStore.getState();
    if (!user || user.isAnonymous) {
      // No wall: the meter needs a server decode (an account), but the
      // preview doesn't — offer that instead.
      setIsLoading(false);
      setServerOnly(true);
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", nextFile);
      const response = await postAnalyzeAudio(formData, {
        onUploadProgress: (p) => runId === latestRun.current && setUpload(p),
      });
      if (runId !== latestRun.current) return;
      setAnalysis(response.analysis);
      setMethod("server");
      trackEvent("free_tool_analysis_completed", { source_tool: "homepage_hero", input: source, method: "server" });
    } catch (err) {
      if (runId === latestRun.current) setError(err?.message || t("lufsMeter.failed"));
    } finally {
      if (runId === latestRun.current) {
        setIsLoading(false);
        setUpload(null);
      }
    }
  };

  // The sample's analysis is the engine's own measurement of this exact
  // file, already rendered into DEMO_MASTER — shown instantly, with no
  // upload and no account. Gating it behind sign-up put a wall in front of
  // the one result that costs nothing to show.
  const trySample = () => {
    trackEvent("cta_click", { cta_id: "try_sample", location: "homepage_hero" });
    latestRun.current += 1; // supersede any upload still in flight
    setFile(null);
    setInput("sample");
    setError("");
    setIsLoading(false);
    setUpload(null);
    setAnalysis(DEMO_MASTER.analysis_before);
    setMethod("server"); // the engine's own stored measurement
    trackEvent("free_tool_analysis_completed", { source_tool: "homepage_hero", input: "sample" });
  };

  const masterThisTrack = () => {
    trackEvent("free_tool_master_cta_clicked", { source_tool: "homepage_hero", input });
    const { user } = useAuthStore.getState();
    if (user && !user.isAnonymous) {
      setMasteringFile(file, "homepage_hero");
      router.push("/app?tab=master");
      return;
    }
    runPublicPreview();
  };

  const runPublicPreview = async () => {
    if (!file || previewing) return;
    const runId = latestRun.current;
    setPreviewing(true);
    setError("");
    trackEvent("public_preview_started", { source_tool: "homepage_hero" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await postPublicPreview(formData, {
        onUploadProgress: (p) => runId === latestRun.current && setPreviewUpload(p),
      });
      if (runId !== latestRun.current) return;
      setPreview(result);
      trackEvent("public_preview_completed", { source_tool: "homepage_hero", genre: result.genre });
    } catch (err) {
      if (runId !== latestRun.current) return;
      trackEvent("public_preview_failed", { source_tool: "homepage_hero", error_code: err?.code || null, status: err?.status || null });
      if (err?.code === "public_preview_limit" || err?.code === "public_preview_busy") {
        // Out of signed-out previews: the account is the way forward, and
        // the file comes along (no re-upload).
        setError(t("heroTry.previewLimited"));
        openSignupGate();
      } else {
        setError(err?.message || t("lufsMeter.failed"));
      }
    } finally {
      if (runId === latestRun.current) {
        setPreviewing(false);
        setPreviewUpload(null);
      }
    }
  };

  // Stashed when the gate opens, not only in onDone: signing in makes
  // HomeClient redirect to /app straight away, which can beat onDone.
  const openSignupGate = () => {
    stashPendingToolFile(file);
    setGate({ kind: "master" });
  };

  const getFullMaster = () => {
    trackEvent("cta_click", { cta_id: "public_preview_get_full", location: "homepage_hero" });
    openSignupGate();
  };

  const reset = () => {
    latestRun.current += 1;
    setFile(null);
    setInput(null);
    setAnalysis(null);
    setPreview(null);
    setServerOnly(false);
    setError("");
  };

  return (
    <div className="bezel bezel-on-dark relative z-10 w-full">
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

        <LufsMeterResult analysis={analysis} method={method} />

        {analysis && input === "sample" ? (
          <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-[13px] leading-relaxed text-text-primary">
            {t("heroTry.sampleAfter", {
              before: DEMO_MASTER.before_lufs.toFixed(1),
              after: DEMO_MASTER.after_lufs.toFixed(1),
            })}{" "}
            <a href="#hear-it" className="font-semibold underline decoration-black/20 underline-offset-4 hover:text-accent">
              {t("heroTry.sampleListen")}
            </a>
            <p className="m-0 mt-2 text-text-secondary">{t("heroTry.sampleNext")}</p>
          </div>
        ) : null}

        {serverOnly && input === "upload" && !preview ? (
          <p className="m-0 mt-3 text-[13px] text-text-secondary">{t("heroTry.cantMeasure")}</p>
        ) : null}

        {(analysis || serverOnly) && input === "upload" && !preview ? (
          <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-center">
            <button
              type="button"
              onClick={masterThisTrack}
              disabled={previewing}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-bg transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
            >
              {previewing ? (
                <>
                  <Spinner size={13} /> {uploadStatusText(t, previewUpload, t("heroTry.previewing"))}
                </>
              ) : signedIn ? (
                t("lufsMeter.masterThisTrack")
              ) : (
                t("heroTry.hearPreview")
              )}
            </button>
            <p className="mt-2 text-[11px] text-text-secondary">{signedIn ? t("lufsMeter.sameFileNote") : t("heroTry.previewNote")}</p>
          </div>
        ) : null}

        {preview && input === "upload" ? (
          <>
            <PublicPreviewPlayer
              originalFile={file}
              previewUrl={apiUrl(preview.preview_url)}
              startSeconds={preview.preview_excerpt_start_s}
              gainMatch={preview.ab_gain_match}
            />
            <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-center">
              <button
                type="button"
                onClick={getFullMaster}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-bg transition hover:opacity-85"
              >
                {t("heroTry.getFull")}
              </button>
              <p className="mt-2 text-[11px] text-text-secondary">{t("heroTry.getFullNote")}</p>
            </div>
          </>
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

      {gate?.kind === "master" ? (
        <ChordAuthGate
          eyebrowKey={preview ? "previewGate.eyebrow" : "lufsGate.eyebrow"}
          titleKey={preview ? "previewGate.title" : "lufsGate.title"}
          bodyKey={preview ? "previewGate.body" : "lufsGate.body"}
          onClose={() => {
            setGate(null);
            takePendingToolFile(); // discard the stash; the visitor backed out
          }}
          onDone={async () => {
            await stashPendingToolFile(file);
            router.push("/app?tab=master");
          }}
        />
      ) : null}
    </div>
  );
}
