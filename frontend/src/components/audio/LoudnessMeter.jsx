"use client";

import { motion } from "motion/react";

// Display range, not a measurement range — wide enough to place any
// realistic mastering target (this app's engine targets run roughly
// -18 to -7 LUFS across genres, see content/loudnessTargets.js) with
// visible headroom on both sides.
const SCALE_MIN = -24;
const SCALE_MAX = -6;

function toPercent(lufs) {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, lufs));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

/**
 * A horizontal LUFS meter — takes real numbers as props rather than
 * measuring anything live client-side. There's no browser-side LUFS
 * analysis pipeline; callers feed this genuine target/measured values
 * (e.g. from content/loudnessTargets.js, the same data the DSP engine
 * itself uses) so the visual stays honest instead of faking a live
 * reading. `currentLufs` is optional — omit it to show only the target
 * marker (e.g. before a track exists to measure).
 */
export default function LoudnessMeter({ targetLufs, currentLufs, label, className = "" }) {
  const targetPct = toPercent(targetLufs);
  const currentPct = currentLufs != null ? toPercent(currentLufs) : null;

  return (
    <div className={className}>
      {label ? <p className="m-0 mb-2 text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</p> : null}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        {currentPct != null ? (
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-ember to-brass"
            initial={{ width: 0 }}
            animate={{ width: `${currentPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        ) : null}
        {/* Target marker — a thin line, not part of the fill, so it stays
            visible whether or not a current value is also shown. */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/70"
          style={{ left: `${targetPct}%` }}
          title={`Target: ${targetLufs} LUFS`}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-text-secondary">
        <span>{SCALE_MIN} LUFS</span>
        <span className="text-brass">
          target {targetLufs} LUFS
          {currentPct != null ? <span className="text-white"> · {currentLufs} LUFS</span> : null}
        </span>
        <span>{SCALE_MAX} LUFS</span>
      </div>
    </div>
  );
}
