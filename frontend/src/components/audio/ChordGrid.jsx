"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Chord chart laid out on the song's actual beat grid.
 *
 * The previous display was a wrapping row of chips: every chord the same
 * width regardless of whether it lasted half a bar or eight bars, and no
 * relationship to where it falls in the song. You could read which chords
 * occur but not play along, which is the entire point of a chord chart.
 *
 * Here each chord occupies the bars it actually sounds for, grouped into
 * bars of `beatsPerBar`, so duration is visible as width and the chart
 * can be followed in time. Beats come from the analyzer (see
 * chord_service.py) and chord boundaries are already snapped to them
 * server-side, so cells land on the grid instead of drifting against it.
 *
 * Falls back to a plain time-proportional layout when the analyzer
 * returned no beats — an older cached result, or a track whose tempo
 * could not be tracked.
 */
export default function ChordGrid({ chords = [], beats = [], beatsPerBar = 4, currentTime = 0, duration = 0, onSeek }) {
  const scrollerRef = useRef(null);
  const activeRef = useRef(null);

  // One cell per bar, each carrying whichever chords sound inside it.
  const bars = useMemo(() => {
    if (!chords.length) return [];

    // No beat grid: fall back to fixed-duration pseudo-bars so the
    // component still renders something time-proportional.
    if (beats.length < beatsPerBar + 1) {
      return chords.map((c, i) => ({
        index: i,
        start: c.start,
        end: c.end,
        chords: [c],
      }));
    }

    const out = [];
    for (let i = 0; i + beatsPerBar <= beats.length - 1; i += beatsPerBar) {
      const start = beats[i];
      const end = beats[Math.min(i + beatsPerBar, beats.length - 1)];
      // A chord belongs to this bar if it overlaps it at all; a chord
      // spanning four bars therefore appears in each, which is how a
      // printed chart reads rather than leaving three bars blank.
      const inBar = chords.filter((c) => c.end > start + 1e-6 && c.start < end - 1e-6);
      out.push({ index: out.length, start, end, chords: inBar });
    }
    return out;
  }, [chords, beats, beatsPerBar]);

  const activeBar = useMemo(
    () => bars.findIndex((b) => currentTime >= b.start && currentTime < b.end),
    [bars, currentTime],
  );

  // Keep the playhead bar in view while the song plays. `block: "nearest"`
  // so it only scrolls when the bar actually leaves the viewport, instead
  // of yanking the list on every bar change.
  useEffect(() => {
    if (activeBar < 0 || !activeRef.current || !scrollerRef.current) return;
    activeRef.current.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeBar]);

  if (!bars.length) return null;

  const hasBeatGrid = beats.length >= beatsPerBar + 1;

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">
          Chord chart
        </p>
        <p className="m-0 text-[11px] text-text-secondary">
          {hasBeatGrid ? `${beatsPerBar}/4 · aligned to detected beats` : "time-aligned (no beat grid detected)"}
        </p>
      </div>

      <div
        ref={scrollerRef}
        className="grid max-h-[22rem] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-4 lg:grid-cols-8"
      >
        {bars.map((bar) => {
          const isActive = bar.index === activeBar;
          const isPast = currentTime >= bar.end;
          return (
            <button
              key={`${bar.start}-${bar.index}`}
              ref={isActive ? activeRef : null}
              type="button"
              onClick={() => onSeek?.(bar.start)}
              aria-current={isActive ? "true" : undefined}
              aria-label={`Bar ${bar.index + 1}: ${bar.chords.map((c) => c.chord).join(", ") || "no chord"}`}
              className={`relative flex aspect-[5/4] flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-all duration-200 ${
                isActive
                  ? "bg-text-primary text-bg shadow-[0_6px_20px_-8px_rgba(36,32,26,0.55)]"
                  : isPast
                    ? "bg-black/[0.055] text-text-secondary"
                    : "bg-black/[0.03] text-text-primary hover:bg-black/[0.07]"
              }`}
            >
              {/* Bar number, small and out of the way — orientation when
                  scanning a long chart, not a thing to read. */}
              <span
                className={`absolute left-1.5 top-1 font-mono text-[9px] ${
                  isActive ? "text-bg/60" : "text-text-secondary/60"
                }`}
              >
                {bar.index + 1}
              </span>

              {bar.chords.length ? (
                <span className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0">
                  {bar.chords.map((c, i) => (
                    <span
                      key={`${c.start}-${i}`}
                      className={`font-[var(--font-title)] font-semibold tracking-[-0.02em] ${
                        // Two or more changes in one bar: smaller, so the
                        // cell stays the same size and the grid keeps its
                        // rhythm instead of reflowing.
                        bar.chords.length > 2 ? "text-[13px]" : bar.chords.length > 1 ? "text-[15px]" : "text-[19px] sm:text-[22px]"
                      }`}
                    >
                      {c.chord}
                    </span>
                  ))}
                </span>
              ) : (
                <span aria-hidden="true" className="text-sm opacity-30">
                  ·
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-text-secondary">Tap any bar to jump there.</p>
    </div>
  );
}
