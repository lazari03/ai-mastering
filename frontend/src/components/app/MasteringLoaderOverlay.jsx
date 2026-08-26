"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import LogoMark from "@/components/brand/LogoMark";
import { shuffledQuotes } from "@/lib/masteringQuotes";

const QUOTE_INTERVAL_MS = 5000;

/**
 * Fullscreen render-status overlay — replaces the inline progress bar as
 * the primary "something real is happening" signal. Portaled to
 * document.body so it truly covers the viewport regardless of any
 * ancestor's overflow/transform (the app shell uses both), independent of
 * where in the tree it's mounted from.
 *
 * `progress`/`phaseMessage`/`logs` are the real, already-computed
 * simulated progress from useMasteringProgress — this component doesn't
 * invent its own fake timeline, it just presents that one more
 * convincingly: a rotating line from masteringQuotes.js so a render that
 * takes tens of seconds (real multiband DSP, not an instant filter)
 * doesn't read as dead air, plus the phase log box below so what the
 * engine is doing is visible as a running record, not only as the single
 * current line.
 *
 * Quote rotation is AnimatePresence mode="wait" keyed by index — the
 * outgoing quote fully fades out before the next fades in, so two quotes
 * can never render on top of each other. The previous hand-rolled
 * version (interval + setTimeout swapping text mid-CSS-transition) could
 * visibly glitch when a timer fired late: text swapped while still
 * fading, reading as quotes overlapping/morphing into each other.
 */
export default function MasteringLoaderOverlay({ visible, progress = 0, phaseMessage = "", logs = [] }) {
  const [mounted, setMounted] = useState(false);
  const [quotes] = useState(() => shuffledQuotes());
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) {
      setQuoteIndex(0);
      return undefined;
    }
    const intervalId = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % quotes.length);
    }, QUOTE_INTERVAL_MS);
    return () => clearInterval(intervalId);
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

      {/* min-h-0 + overflow-y-auto: on short phone viewports the full
          stack (rings + bar + quote + log box) can exceed the screen —
          scroll inside the overlay rather than clipping the log box. */}
      <div className="relative z-10 flex max-h-full min-h-0 w-full max-w-[520px] flex-col items-center overflow-y-auto px-6 py-8 text-center">
        {/* Pulsing ring stack around the logo — three staggered rings, pure
            CSS (pulseRing keyframe in globals.css), no per-frame JS cost. */}
        <div className="relative mb-8 flex h-24 w-24 shrink-0 items-center justify-center">
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
        <div className="mb-2 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-[width] duration-500 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <p className="mb-8 text-[11px] text-zinc-500">{clampedProgress}%</p>

        {/* Rotating quote — mode="wait" guarantees the outgoing quote is
            fully gone before the next appears. Fixed min-height so the
            layout doesn't jump as line lengths change. */}
        <div className="flex min-h-[4.5rem] w-full shrink-0 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={quoteIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="m-0 max-w-[38ch] font-[var(--font-title)] text-[15px] italic leading-relaxed text-zinc-200"
            >
              "{quotes[quoteIndex]}"
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Live phase log — the same timeline entries useMasteringProgress
            feeds the phase line above, kept as a running record (the hook
            caps it at the last 8) so a long render shows visible forward
            motion, not just one line replacing itself. */}
        {logs.length ? (
          <div className="mt-6 w-full shrink-0 rounded-xl border border-white/10 bg-black/40 p-3.5 text-left backdrop-blur-sm">
            <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Engine log</p>
            <div className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
              {logs.map((entry, i) => (
                <motion.p
                  key={entry.ts}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={`m-0 break-words ${i === logs.length - 1 ? "text-brass" : "text-zinc-500"}`}
                >
                  {entry.text}
                </motion.p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
