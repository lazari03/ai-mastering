"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import FileDropzone from "@/components/ui/FileDropzone";
import LufsMeterResult from "./LufsMeterResult";
import ChordAuthGate from "./ChordAuthGate";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { postAnalyzeAudio } from "@/network/http/client";
import { stashPendingToolFile } from "@/lib/toolHandoff";
import { trackEvent } from "@/lib/analytics";
import { uploadStatusText } from "@/lib/uploadProgress";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

/**
 * The public, logged-out-friendly LUFS Meter on /lufs-meter — same shape
 * as PublicChordDetector.jsx: upload + analysis run before any account
 * exists (ensureAnonymous, same quota-free /analyze endpoint the Studio's
 * live preview already uses), only "Master This Track" requires an
 * account. Reuses the exact same DSP analysis Studio's adaptive engine
 * runs on every upload — this isn't a separate lightweight approximation,
 * it's the same integrated_lufs/true_peak_db/loudness_range_lu numbers
 * the real mastering engine measures.
 */
export default function PublicLufsMeter() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const setMasteringFile = useMasteringStore((s) => s.setFile);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState("");
  const [showGate, setShowGate] = useState(false);

  useEffect(() => {
    trackEvent("free_tool_opened", { source_tool: "lufs_meter" });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) useAuthStore.getState().ensureAnonymous();
  }, [loading, user]);

  const analyze = async () => {
    if (!file) return;
    setIsLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await postAnalyzeAudio(formData, { onUploadProgress: setUpload });
      setAnalysis(response.analysis);
      trackEvent("free_tool_analysis_completed", { source_tool: "lufs_meter" });
    } catch (err) {
      setError(err?.message || t("lufsMeter.failed"));
    } finally {
      setIsLoading(false);
      setUpload(null);
    }
  };

  const masterThisTrack = () => {
    trackEvent("free_tool_master_cta_clicked", { source_tool: "lufs_meter" });
    if (user && !user.isAnonymous) {
      setMasteringFile(file, "lufs_meter");
      router.push("/app?tab=master");
      return;
    }
    setShowGate(true);
  };

  const ready = !loading && Boolean(user);

  return (
    <div className="relative">
      <FileDropzone
        id="lufsMeterFileInput"
        fileName={file?.name}
        onChange={(event) => {
          setAnalysis(null);
          setFile(event.target.files?.[0] || null);
        }}
        onRemove={() => {
          setAnalysis(null);
          setFile(null);
        }}
      />

      <button
        type="button"
        onClick={analyze}
        disabled={!file || isLoading || !ready}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-bg transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Spinner size={15} /> {uploadStatusText(t, upload, t("lufsMeter.analyzing"))}
          </>
        ) : (
          t("lufsMeter.measure")
        )}
      </button>
      <p className="mt-1.5 text-[11px] text-text-secondary">{t("lufsMeter.alwaysFree")}</p>

      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          {file ? (
            <button type="button" onClick={analyze} className="btn-secondary btn-sm">
              {t("chordDetector.tryAgain")}
            </button>
          ) : null}
        </div>
      ) : null}

      <LufsMeterResult analysis={analysis} />

      {analysis ? (
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
