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
import { measureFileLocally, LocalMeasureUnavailable, SilentAudioError } from "@/lib/localLoudness";
import { trackEvent } from "@/lib/analytics";
import { uploadStatusText } from "@/lib/uploadProgress";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

/**
 * The public LUFS Meter on /lufs-meter. Measures in the browser first
 * (lib/localLoudness.js — a port of the engine's own BS.1770 meter, same
 * integrated_lufs/true_peak_db/loudness_range_lu), so anyone gets a reading
 * with no account and no upload. Only when the browser can't decode the
 * file does it fall back to the server /analyze endpoint, which needs a
 * registered account (anonymous sign-in is off): a signed-out visitor then
 * gets ChordAuthGate, and the measurement runs once they sign up or log in.
 */
export default function PublicLufsMeter() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user } = useAuthStore();
  const setMasteringFile = useMasteringStore((s) => s.setFile);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState("");
  const [gate, setGate] = useState(null); // null | "analyze" | "master"
  const [method, setMethod] = useState(null); // "browser" | "server"
  const registered = Boolean(user) && !user.isAnonymous;

  useEffect(() => {
    trackEvent("free_tool_opened", { source_tool: "lufs_meter" });
  }, []);

  const analyze = async ({ serverOnly = false } = {}) => {
    if (!file) return;
    setIsLoading(true);
    setError("");
    if (!serverOnly) {
      try {
        setAnalysis(await measureFileLocally(file));
        setMethod("browser");
        trackEvent("free_tool_analysis_completed", { source_tool: "lufs_meter", method: "browser" });
        setIsLoading(false);
        return;
      } catch (err) {
        if (err instanceof SilentAudioError) {
          setError(t("lufsMeter.silent"));
          setIsLoading(false);
          return;
        }
        if (!(err instanceof LocalMeasureUnavailable)) {
          setError(err?.message || t("lufsMeter.failed"));
          setIsLoading(false);
          return;
        }
        // Browser can't decode this file: fall through to the server.
      }
    }
    // Read at fallback time, not render time: auth may still have been
    // loading when Measure was clicked (measuring locally doesn't wait for it).
    const current = useAuthStore.getState().user;
    if (!serverOnly && !(current && !current.isAnonymous)) {
      setIsLoading(false);
      setGate("analyze");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await postAnalyzeAudio(formData, { onUploadProgress: setUpload });
      setAnalysis(response.analysis);
      setMethod("server");
      trackEvent("free_tool_analysis_completed", { source_tool: "lufs_meter", method: "server" });
    } catch (err) {
      setError(err?.message || t("lufsMeter.failed"));
    } finally {
      setIsLoading(false);
      setUpload(null);
    }
  };

  const masterThisTrack = () => {
    trackEvent("free_tool_master_cta_clicked", { source_tool: "lufs_meter" });
    if (registered) {
      setMasteringFile(file, "lufs_meter");
      router.push("/app?tab=master");
      return;
    }
    setGate("master");
  };

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
        onClick={() => analyze()}
        disabled={!file || isLoading}
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
            <button type="button" onClick={() => analyze()} className="btn-secondary btn-sm">
              {t("chordDetector.tryAgain")}
            </button>
          ) : null}
        </div>
      ) : null}

      <LufsMeterResult analysis={analysis} method={method} />

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

      {gate === "analyze" ? (
        <ChordAuthGate
          eyebrowKey="toolGate.eyebrow"
          titleKey="toolGate.title"
          bodyKey="toolGate.body"
          onClose={() => setGate(null)}
          onDone={() => {
            setGate(null);
            analyze({ serverOnly: true });
          }}
        />
      ) : null}

      {gate === "master" ? (
        <ChordAuthGate
          eyebrowKey="lufsGate.eyebrow"
          titleKey="lufsGate.title"
          bodyKey="lufsGate.body"
          onClose={() => setGate(null)}
          onDone={async () => {
            await stashPendingToolFile(file);
            router.push("/app?tab=master");
          }}
        />
      ) : null}
    </div>
  );
}
