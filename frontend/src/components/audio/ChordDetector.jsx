"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { postAnalyzeChords } from "@/network/http/client";
import { uploadStatusText } from "@/lib/uploadProgress";
import { trackEvent } from "@/lib/analytics";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Analyzer-reported confidence (0..1, see backend chord_service.py) as a
// plain-language level. Thresholds follow Essentia's own guidance for
// RhythmExtractor2013 (>3.5 of 5.32 ≈ 0.66 is very reliable).
function confidenceLevel(value) {
  if (value == null) return null;
  if (value >= 0.66) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

/**
 * focus: which measurement the page is about — "chords" (default), "key"
 * (Song Key Finder) or "bpm" (BPM Finder). The focused value is shown
 * first and largest; everything else is still there.
 */
export default function ChordDetector({ file, previewUrl, onMasterThisSong, onAnalysisResult, initialAnalysis = null, sourceTool = "chord_detector", focus = "chords" }) {
  const { t } = useLanguage();
  // initialAnalysis: a result computed elsewhere and handed off here — see
  // ChordsPanel.jsx's sessionStorage pickup for the public chord
  // detector's logged-out-analyze-then-log-in-to-see-it flow. The raw
  // audio file never survives that handoff (a real page navigation, not
  // just a state carry-over), only the JSON result does — so the
  // player/live-highlighting section below simply has nothing to attach
  // to in that case, same as any other result with no file/previewUrl.
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const audioRef = useRef(null);

  // Chord detection is unconditionally free — no quota, no credits, no
  // subscription to check (see backend-node's /analyze-chords).
  const detect = async () => {
    if (!file) return;
    setIsLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await postAnalyzeChords(formData, { onUploadProgress: setUpload });
      setAnalysis(result);
      // Only fired when onAnalysisResult is set — that's PublicChordDetector's
      // signal that this run happened on the public, logged-out-friendly
      // free tool, not the in-app Chords tab (an already-authenticated,
      // non-funnel context).
      if (onAnalysisResult) {
        trackEvent("free_tool_analysis_completed", { source_tool: sourceTool });
      }
      // Optional — only PublicChordDetector.jsx passes this, to know when
      // to show its login/signup gate over the result. Every other caller
      // (the in-app Chords tab) leaves it unset.
      onAnalysisResult?.(result);
    } catch (err) {
      setError(err?.message || t("chordDetector.failed"));
    } finally {
      setIsLoading(false);
      setUpload(null);
    }
  };

  const onTimeUpdate = () => {
    const chords = analysis?.chords;
    const currentTime = audioRef.current?.currentTime;
    if (!chords || currentTime == null) return;
    // ponytail: linear scan over beat-length list, fine at this size. Binary search if tracks get much longer.
    const idx = chords.findIndex((c) => currentTime >= c.start && currentTime < c.end);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const chordChips = useMemo(() => analysis?.chords || [], [analysis]);

  // The login-handoff path (ChordsPanel.jsx) seeds `analysis` immediately
  // from the stashed JSON result, so this <audio> element can mount before
  // the actual file arrives from its async IndexedDB pickup — previewUrl
  // starts empty and updates a beat later. Just letting React patch the
  // `src` attribute on that later update isn't reliable once the element
  // already went through a resource-selection pass with nothing to play;
  // an explicit load() forces it to pick up the real source instead of
  // silently staying in its earlier (no-audio) state.
  useEffect(() => {
    if (previewUrl) audioRef.current?.load();
  }, [previewUrl]);

  return (
    <div>
      <button
        type="button"
        onClick={detect}
        disabled={!file || isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-bg transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? (
          <>
            <Spinner size={15} /> {uploadStatusText(t, upload, t("chordDetector.analyzing"))}
          </>
        ) : (
          t(focus === "key" ? "chordDetector.detectKey" : focus === "bpm" ? "chordDetector.detectBpm" : "chordDetector.detect")
        )}
      </button>
      <p className="mt-1.5 text-[11px] text-text-secondary">{t("chordDetector.alwaysFree")}</p>

      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          {file ? (
            <button type="button" onClick={detect} className="btn-secondary btn-sm">
              {t("chordDetector.tryAgain")}
            </button>
          ) : null}
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          <ResultMetrics analysis={analysis} focus={focus} t={t} />

          <p className="text-[11px] text-text-secondary">{t("chordDetector.estimatedNote")}</p>

          <audio ref={audioRef} src={previewUrl || undefined} controls onTimeUpdate={onTimeUpdate} className="w-full" />

          <div className="rounded-xl border border-border-subtle bg-white/60 p-4">
            <p className="m-0 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-text-secondary">{t("chordDetector.chordProgression")}</p>
            {chordChips.length ? (
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {chordChips.map((c, idx) => (
                  <span
                    key={`${c.start}-${c.chord}`}
                    className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                      idx === activeIndex ? "border-accent bg-accent/10 text-text-primary" : "border-border-subtle bg-bg text-text-secondary"
                    }`}
                  >
                    {c.chord}
                  </span>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm leading-relaxed text-text-secondary">{t("chordDetector.noChords")}</p>
            )}
          </div>

          {onMasterThisSong ? (
            // The cross-sell moment — right after the answer they came for,
            // not before it. Reuses the same File object already in memory
            // (see ChordsPanel.jsx), so this jumps straight into the
            // Master tab with the track already attached, no re-upload.
            <div className="rounded-xl border border-border-subtle bg-black/[0.045] p-4 text-center">
              <button
                type="button"
                onClick={() => {
                  trackEvent("free_tool_master_cta_clicked", { source_tool: sourceTool });
                  onMasterThisSong();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-bg transition hover:opacity-85"
              >
                {t("chordDetector.masterThisSong")}
              </button>
              <p className="mt-2 text-[11px] text-text-secondary">{t("chordDetector.sameFileNote")}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-secondary">
          {file ? t("chordDetector.emptyWithFile") : t("chordDetector.emptyNoFile")}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, confidence, large, t }) {
  const level = confidenceLevel(confidence);
  return (
    <div className={`rounded-xl border border-border-subtle bg-white/60 p-3 sm:p-4 ${large ? "col-span-2 sm:col-span-1" : ""}`}>
      <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">{label}</p>
      <p className={`mt-1.5 font-[var(--font-title)] font-semibold tracking-[-0.02em] text-text-primary ${large ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>{value}</p>
      {level ? (
        <p className="m-0 mt-1 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${level === "high" ? "bg-emerald-600" : level === "medium" ? "bg-amber-500" : "bg-red-500"}`} />
          {t("chordDetector.confidence", { level: t(`chordDetector.confidence.${level}`) })}
        </p>
      ) : null}
    </div>
  );
}

function ResultMetrics({ analysis, focus, t }) {
  const key = { id: "key", label: t("chordDetector.key"), value: analysis.key, confidence: analysis.key_confidence };
  const bpm = { id: "bpm", label: t("chordDetector.bpm"), value: analysis.bpm, confidence: analysis.bpm_confidence };
  const duration = { id: "duration", label: t("chordDetector.duration"), value: formatDuration(analysis.duration) };
  const ordered = focus === "bpm" ? [bpm, key, duration] : [key, bpm, duration];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {ordered.map((m, i) => (
        <Metric key={m.id} label={m.label} value={m.value} confidence={m.confidence} large={i === 0 && focus !== "chords"} t={t} />
      ))}
    </div>
  );
}
