"use client";

import { useMemo, useRef, useState } from "react";

import { postAnalyzeChords } from "@/network/http/client";

export default function ChordDetector({ file, previewUrl }) {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const audioRef = useRef(null);

  const detect = async () => {
    if (!file) return;
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Chord & Key Detector</p>
        <button
          type="button"
          onClick={detect}
          disabled={!file || isLoading}
          className="rounded-lg border border-brass/40 bg-brass/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-brass disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Analyzing..." : "Detect Chords"}
        </button>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {analysis ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">BPM: {analysis.bpm}</span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Key: {analysis.key}</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Estimated from the audio, not ground truth — a starting point for the key and chords, not a guaranteed-accurate transcription.
          </p>

          <audio
            ref={audioRef}
            src={previewUrl}
            controls
            onTimeUpdate={onTimeUpdate}
            className="w-full"
          />

          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-2">
            {chordChips.map((c, idx) => (
              <span
                key={`${c.start}-${c.chord}`}
                className={`rounded-md border px-2 py-1 text-xs transition ${
                  idx === activeIndex
                    ? "border-ember bg-ember/30 text-ember font-semibold"
                    : "border-white/10 bg-black/20 text-zinc-400"
                }`}
              >
                {c.chord}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">
          {file ? "Detect BPM, key, and chords, then play along." : "Choose an audio file first."}
        </p>
      )}
    </div>
  );
}
