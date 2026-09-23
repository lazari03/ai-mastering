"use client";

import { useLanguage } from "@/lib/i18n";

// Contextual bands, not a single "correct" target — this deliberately
// mirrors mastering-loudness-targets/page.js's own framing (genre-
// dependent, streaming normalization means louder isn't "better"), rather
// than inventing a universal LUFS rule this tool would then contradict.
function loudnessContext(t, lufs) {
  if (lufs > -9) return t("lufsMeter.ctx.veryLoud");
  if (lufs > -12) return t("lufsMeter.ctx.loud");
  if (lufs > -16) return t("lufsMeter.ctx.streaming");
  if (lufs > -20) return t("lufsMeter.ctx.quiet");
  return t("lufsMeter.ctx.veryQuiet");
}

function truePeakContext(t, dbtp) {
  return dbtp > -1 ? t("lufsMeter.ctx.peakRisk") : t("lufsMeter.ctx.peakSafe");
}

function rangeContext(t, lra) {
  if (lra < 4) return t("lufsMeter.ctx.rangeNarrow");
  if (lra < 8) return t("lufsMeter.ctx.rangeModerate");
  return t("lufsMeter.ctx.rangeWide");
}

export default function LufsMeterResult({ analysis }) {
  const { t } = useLanguage();
  if (!analysis) return null;
  const { integrated_lufs: lufs, true_peak_db: peak, loudness_range_lu: lra } = analysis;

  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border-subtle bg-white/60 p-4">
          <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">{t("lufsMeter.integratedLabel")}</p>
          <p className="mt-1.5 font-[var(--font-title)] text-2xl font-semibold tracking-[-0.02em] text-text-primary">{lufs.toFixed(1)} LUFS</p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">{loudnessContext(t, lufs)}</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-white/60 p-4">
          <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">{t("lufsMeter.truePeakLabel")}</p>
          <p className="mt-1.5 font-[var(--font-title)] text-2xl font-semibold tracking-[-0.02em] text-text-primary">{peak.toFixed(1)} dBTP</p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">{truePeakContext(t, peak)}</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-white/60 p-4">
          <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">{t("lufsMeter.rangeLabel")}</p>
          <p className="mt-1.5 font-[var(--font-title)] text-2xl font-semibold tracking-[-0.02em] text-text-primary">{lra.toFixed(1)} LU</p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">{rangeContext(t, lra)}</p>
        </div>
      </div>
      <p className="text-[11px] text-text-secondary">{t("lufsMeter.measuredNote")}</p>
    </div>
  );
}
