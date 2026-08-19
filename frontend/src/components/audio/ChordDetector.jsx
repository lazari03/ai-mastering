"use client";

import { useMemo, useRef, useState } from "react";

import { postAnalyzeChords } from "@/network/http/client";
import { useEntitlementsStore, planUnlocksChordsAndShare } from "@/store/entitlementsStore";

export default function ChordDetector({ file, previewUrl }) {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const audioRef = useRef(null);

  const { plan } = useEntitlementsStore();
  const chordsUnlocked = planUnlocksChordsAndShare(plan);

  const detect = async () => {
    if (!file || !chordsUnlocked) return;
    setIsLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await postAnalyzeChords(formData);
      setAnalysis(result);
    } catch (err) {
      setError(err?.message || "Chord detection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const onTimeUpdate = () => {
    const chords = analysis?.chords;
    const t = audioRef.current?.currentTime;
    if (!chords || t == null) return;
    // ponytail: linear scan over beat-length list, fine at this size. Binary search if tracks get much longer.
    const idx = chords.findIndex((c) => t >= c.start && t < c.end);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const chordChips = useMemo(() => analysis?.chords || [], [analysis]);

  return (
    <div>
      <button
        type="button"
        onClick={detect}
        disabled={!file || isLoading || !chordsUnlocked}
        className="w-full rounded-2xl bg-ember px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#100b08] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Analyzing..." : chordsUnlocked ? "Detect Chords" : "Detect Chords — All-Access"}
      </button>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        {chordsUnlocked
          ? "Unlimited on your plan."
          : "Included with All-Access (€19.99/mo) — not available on Free or Studio. Upgrade in Settings → Billing."}
      </p>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Key</p>
              <p className="mt-1.5 text-xl font-bold">{analysis.key}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">BPM</p>
              <p className="mt-1.5 text-xl font-bold">{analysis.bpm}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Time Sig.</p>
              <p className="mt-1.5 text-xl font-bold">4/4</p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Estimated from the audio, not ground truth — a starting point for the key and chords, not a guaranteed-accurate transcription.
          </p>

          <audio ref={audioRef} src={previewUrl} controls onTimeUpdate={onTimeUpdate} className="w-full" />

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Chord Progression</p>
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
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">
          {file ? "Detect BPM, key, and chords, then play along." : "Choose an audio file first."}
        </p>
      )}
    </div>
  );
}
