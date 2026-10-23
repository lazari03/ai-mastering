"use client";

import { motion } from "motion/react";

// Display range — 0 dBTP (digital full scale) down to -24, wide enough
// to show any realistic peak alongside a -1 dBTP ceiling with headroom
// visible on both sides.
const SCALE_MIN = -24;
const SCALE_MAX = 0;

function toPercent(db) {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, db));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

/**
 * A vertical true-peak ladder meter — same honesty rule as
 * LoudnessMeter.jsx: takes real dBTP numbers as props, never fakes a
 * live measurement. `ceilingDb` defaults to -1 dBTP, matching this
 * app's actual limiter ceiling (see hero.stat3 copy / mixing_presets.json
 * limiter specs) rather than an invented number.
 */
export default function TruePeakMeter({ peakDb, ceilingDb = -1, label, className = "" }) {
  const peakPct = peakDb != null ? toPercent(peakDb) : null;
  const ceilingPct = toPercent(ceilingDb);
  const overCeiling = peakDb != null && peakDb > ceilingDb;

  return (
    <div className={className}>
      {label ? <p className="m-0 mb-2 text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</p> : null}
      <div className="relative h-28 w-6 overflow-hidden rounded-md bg-black/10">
        {/* Ceiling line — everything above it is the "must never cross"
            zone a true-peak-safe limiter exists to prevent. */}
        <div
          className="absolute inset-x-0 z-10 h-0.5 bg-text-primary/70"
          style={{ bottom: `${ceilingPct}%` }}
          title={`Ceiling: ${ceilingDb} dBTP`}
        />
        {peakPct != null ? (
          <motion.div
            className={`absolute inset-x-0 bottom-0 rounded-b-md ${overCeiling ? "bg-red-500" : "bg-accent"}`}
            initial={{ height: 0 }}
            animate={{ height: `${peakPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        ) : null}
      </div>
      <p className="mt-1.5 text-center font-mono text-[11px] text-text-secondary">
        {peakDb != null ? <span className={overCeiling ? "text-red-600" : "text-text-primary"}>{peakDb} dBTP</span> : "—"}
        <span className="block text-text-primary">ceiling {ceilingDb} dBTP</span>
      </p>
    </div>
  );
}
