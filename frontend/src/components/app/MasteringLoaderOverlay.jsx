"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import LogoMark from "@/components/brand/LogoMark";
import { shuffledQuotes } from "@/lib/masteringQuotes";
import { useLanguage } from "@/lib/i18n";
import { useMasteringStore } from "@/store/masteringStore";
import { formatMb } from "@/lib/format";

const QUOTE_INTERVAL_MS = 5000;

const STEPS = ["analyze", "detect", "plan", "master", "verify"];

function fmtElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Fullscreen render-status overlay — replaces the inline progress bar as
 * the primary "something real is happening" signal. Portaled to
 * document.body so it truly covers the viewport regardless of any
 * ancestor's overflow/transform (the app shell uses both), independent of
 * where in the tree it's mounted from.
 *
 * Honest by construction: the backend reports no intermediate progress
 * for a render, so there's no percentage and no "current step" here —
 * an indeterminate bar, the real elapsed time, and the engine's pipeline
 * listed as what happens during a master (not ticked off on a timer).
 * A rotating line from masteringQuotes.js keeps a long render from
 * reading as dead air.
 *
 * Quote rotation is AnimatePresence mode="wait" keyed by index — the
 * outgoing quote fully fades out before the next fades in, so two quotes
 * can never render on top of each other. The previous hand-rolled
 * version (interval + setTimeout swapping text mid-CSS-transition) could
 * visibly glitch when a timer fired late: text swapped while still
 * fading, reading as quotes overlapping/morphing into each other.
 */
export default function MasteringLoaderOverlay({ visible, elapsedSec = 0 }) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [quotes] = useState(() => shuffledQuotes());
  const [quoteIndex, setQuoteIndex] = useState(0);
  // Real bytes-sent progress while the file is still going up — on mobile
  // data that's most of the wait, and it's the one part of a master whose
  // progress is actually known. null once the server has the file.
  const upload = useMasteringStore((s) => s.uploadProgress);
  const uploading = Boolean(upload);
  const uploadRatio = upload?.total ? upload.loaded / upload.total : 0;

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

  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-bg">
      <div className="relative z-10 flex max-h-full min-h-0 w-full max-w-[520px] flex-col items-center overflow-y-auto px-6 py-8 text-center">
        <div className="relative mb-8 flex h-24 w-24 shrink-0 items-center justify-center">
          <span className="pulse-ring absolute inset-0 rounded-full border border-accent/60" />
          <span className="pulse-ring absolute inset-0 rounded-full border border-border-subtle" style={{ animationDelay: "0.6s" }} />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-black/[0.04]">
            <LogoMark size={28} />
          </div>
        </div>

        <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-text-secondary">{t(uploading ? "loader.uploadEyebrow" : "loader.eyebrow")}</p>
        <p className="m-0 font-[var(--font-title)] text-[22px] font-semibold text-text-primary">{t(uploading ? "loader.uploading" : "console.phase.running")}</p>

        {uploading ? (
          // Determinate: these are real bytes sent, from the upload itself.
          <div
            className="mt-6 h-1 w-full shrink-0 overflow-hidden rounded-full bg-black/[0.06]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(uploadRatio * 100)}
          >
            <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${uploadRatio * 100}%` }} />
          </div>
        ) : (
          // Indeterminate: the render itself reports no progress.
          <div className="indeterminate-bar mt-6 h-1 w-full shrink-0 overflow-hidden rounded-full bg-black/[0.06]" aria-hidden="true">
            <span />
          </div>
        )}
        <p className="mb-8 mt-2 font-mono text-[12px] text-text-secondary">
          {uploading && upload.total
            ? t("loader.uploadedOf", { loaded: formatMb(upload.loaded), total: formatMb(upload.total), pct: Math.round(uploadRatio * 100) })
            : t("loader.elapsed", { time: fmtElapsed(elapsedSec) })}
        </p>
        {uploading ? <p className="-mt-6 mb-8 max-w-[36ch] text-[12px] leading-relaxed text-text-secondary">{t("loader.uploadKeepOpen")}</p> : null}

        <div className="w-full shrink-0 rounded-2xl border border-border-subtle bg-white/60 p-4 text-left">
          <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{t("loader.pipelineTitle")}</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-[13px] leading-snug text-text-primary">
                <span className="mt-px font-mono text-[11px] text-text-secondary">{String(i + 1).padStart(2, "0")}</span>
                <span>{t(`loader.step.${step}`)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 flex min-h-[3.5rem] w-full shrink-0 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={quoteIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="m-0 max-w-[38ch] text-[14px] italic leading-relaxed text-text-secondary"
            >
              "{quotes[quoteIndex]}"
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="m-0 mt-2 text-[12px] text-text-secondary">{t("loader.note")}</p>
      </div>
    </div>,
    document.body
  );
}
