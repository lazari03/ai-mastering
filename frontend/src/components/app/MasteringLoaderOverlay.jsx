"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import LogoMark from "@/components/brand/LogoMark";
import { shuffledQuotes } from "@/lib/masteringQuotes";

const QUOTE_INTERVAL_MS = 4200;
const QUOTE_FADE_MS = 500;

/**
 * Fullscreen render-status overlay — replaces the inline progress bar as
 * the primary "something real is happening" signal. Portaled to
 * document.body so it truly covers the viewport regardless of any
 * ancestor's overflow/transform (the app shell uses both), independent of
 * where in the tree it's mounted from.
 *
 * `progress`/`phaseMessage` are the real, already-computed simulated
 * progress from the caller (MasteringConsole) — this component doesn't
 * invent its own fake timeline, it just presents that one more
 * convincingly, plus a rotating line from masteringQuotes.js so a render
 * that takes several seconds to tens of seconds (real multiband DSP, not
 * an instant filter) doesn't read as dead air.
 */
export default function MasteringLoaderOverlay({ visible, progress = 0, phaseMessage = "" }) {
  const [mounted, setMounted] = useState(false);
  const [quotes] = useState(() => shuffledQuotes());
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteVisible, setQuoteVisible] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setQuoteIndex(0);
      setQuoteVisible(true);
      return undefined;
    }

    intervalRef.current = setInterval(() => {
      setQuoteVisible(false);
      window.setTimeout(() => {
        setQuoteIndex((i) => (i + 1) % quotes.length);
        setQuoteVisible(true);
      }, QUOTE_FADE_MS);
    }, QUOTE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, quotes.length]);

  if (!mounted || !visible) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#0b0d10]"
    >
      {/* Same radial-gradient brand wash as the page background (globals.css)
          so the overlay reads as continuous with the app, not a foreign modal. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 8% 6%, rgba(232, 93, 42, 0.22), transparent 42%)," +
            "radial-gradient(circle at 92% 18%, rgba(223, 201, 90, 0.18), transparent 38%)," +
            "radial-gradient(circle at 50% 100%, rgba(232, 93, 42, 0.12), transparent 45%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center px-6 text-center">
        {/* Pulsing ring stack around the logo — three staggered rings, pure
            CSS (pulseRing keyframe in globals.css), no per-frame JS cost. */}
        <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
          <span className="pulse-ring absolute inset-0 rounded-full border border-ember/60" />
          <span className="pulse-ring absolute inset-0 rounded-full border border-brass/50" style={{ animationDelay: "0.6s" }} />
          <span className="pulse-ring absolute inset-0 rounded-full border border-ember/40" style={{ animationDelay: "1.2s" }} />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-sm">
            <LogoMark size={28} />
          </div>
        </div>

        <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-brass">Mastering in progress</p>
        <p className="mb-7 text-xs text-zinc-400">{phaseMessage || "Analyzing the source signal…"}</p>

        {/* Progress bar — same underlying number MasteringConsole already
            computes, just presented at full-screen scale. */}
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-[width] duration-500 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <p className="mb-10 text-[11px] text-zinc-500">{clampedProgress}%</p>

        {/* Rotating quote — crossfades in place, fixed min-height so the
            layout doesn't jump as line lengths change. */}
        <div className="flex min-h-[4.5rem] w-full items-center justify-center">
          <p
            className={`max-w-[38ch] font-[var(--font-title)] text-[15px] italic leading-relaxed text-zinc-200 transition-opacity ease-out ${
              quoteVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${QUOTE_FADE_MS}ms` }}
          >
            "{quotes[quoteIndex]}"
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
