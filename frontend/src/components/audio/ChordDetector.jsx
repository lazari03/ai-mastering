"use client";

import { useMemo, useRef, useState } from "react";

import { postAnalyzeChords } from "@/network/http/client";
import { trackEvent } from "@/lib/analytics";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

export default function ChordDetector({ file, previewUrl, onMasterThisSong, onAnalysisResult, initialAnalysis = null, sourceTool = "chord_detector" }) {
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
      const result = await postAnalyzeChords(formData);
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

  return (
    <div>
      <button
        type="button"
        onClick={detect}
        disabled={!file || isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#100b08] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Spinner size={15} /> {t("chordDetector.analyzing")}
          </>
        ) : (
          t("chordDetector.detect")
        )}
      </button>
      <p className="mt-1.5 text-[11px] text-zinc-500">{t("chordDetector.alwaysFree")}</p>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          {/* gap/padding/type scale down a notch below sm: — three cells
              share ~340px there, and "F# minor" at text-xl inside p-4
              padding was wrapping awkwardly per-word. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.key")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">{analysis.key}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.bpm")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">{analysis.bpm}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.timeSig")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">4/4</p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">{t("chordDetector.estimatedNote")}</p>

          <audio ref={audioRef} src={previewUrl} controls onTimeUpdate={onTimeUpdate} className="w-full" />

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.chordProgression")}</p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {chordChips.map((c, idx) => (
                <span
                  key={`${c.start}-${c.chord}`}
                  className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                    idx === activeIndex
                      ? "border-brass bg-brass/[0.18] text-brass"
                      : "border-white/15 bg-black/20 text-zinc-300"
                  }`}
                >
                  {c.chord}
                </span>
              ))}
            </div>
          </div>

          {onMasterThisSong ? (
            // The cross-sell moment — right after the answer they came for,
            // not before it. Reuses the same File object already in memory
            // (see ChordsPanel.jsx), so this jumps straight into the
            // Master tab with the track already attached, no re-upload.
            <div className="rounded-xl border border-brass/30 bg-brass/[0.06] p-4 text-center">
              <button
                type="button"
                onClick={() => {
                  trackEvent("free_tool_master_cta_clicked", { source_tool: sourceTool });
                  onMasterThisSong();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-[#100b08] transition hover:brightness-110"
              >
                {t("chordDetector.masterThisSong")}
              </button>
              <p className="mt-2 text-[11px] text-zinc-500">{t("chordDetector.sameFileNote")}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">
          {file ? t("chordDetector.emptyWithFile") : t("chordDetector.emptyNoFile")}
        </p>
      )}
    </div>
  );
}
