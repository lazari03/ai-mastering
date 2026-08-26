"use client";

import Knob from "@/components/ui/Knob";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

// The Quick-mode counterpart to ProParamsPanel — instead of a manual
// literal spec (that engine doesn't know what "genre" even means), this
// shows and lets the user nudge the REAL adaptive-engine values for
// whatever genre/style/category/flavour/tags is currently selected,
// against the actual uploaded file. The 7 knobs are backend/ai_mastering's
// existing tweak sliders (low_end/punch/presence/brightness/warmth/width/
// loudness — see mastering_params.py:_apply_user_tweaks), previously
// computed and sent on submit but with no UI anywhere to see or adjust
// them; the band bars below are the live, real per-band EQ correction
// those tweaks (plus genre/style/category/flavour/tags) currently produce
// — computed by the same compute_processing_params() call a real render
// uses (see masteringStore.js:refreshPreviewParams), not an approximation.
const TWEAKS = [
  ["low_end", "adaptive.tweak.lowEnd"],
  ["punch", "adaptive.tweak.punch"],
  ["presence", "adaptive.tweak.presence"],
  ["brightness", "adaptive.tweak.brightness"],
  ["warmth", "adaptive.tweak.warmth"],
  ["width", "adaptive.tweak.width"],
  ["loudness", "adaptive.tweak.loudness"],
];

const BANDS = [
  ["sub_bass_20_60hz", "adaptive.band.sub"],
  ["bass_60_250hz", "adaptive.band.bass"],
  ["low_mid_250_500hz", "adaptive.band.lowMid"],
  ["mid_500_2000hz", "adaptive.band.mid"],
  ["high_mid_2000_4000hz", "adaptive.band.highMid"],
  ["presence_4000_6000hz", "adaptive.band.presence"],
  ["brilliance_6000_20000hz", "adaptive.band.air"],
];

// +/-8dB covers the correction ceiling compute_processing_params actually
// uses (up to -6/+4dB severity-scaled, plus a little user-tweak headroom
// on top) — bars very rarely clip against this range, and when they do
// it's still an accurate "this band is being pushed hard" signal.
const BAR_RANGE_DB = 8;

function BandBar({ label, db }) {
  const clamped = Math.max(-BAR_RANGE_DB, Math.min(BAR_RANGE_DB, db));
  const centerPct = 50;
  const valuePct = ((clamped + BAR_RANGE_DB) / (BAR_RANGE_DB * 2)) * 100;
  const positive = clamped >= 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 truncate text-[9px] uppercase tracking-[0.06em] text-zinc-500">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
        <div
          className={`absolute inset-y-0 ${positive ? "bg-brass" : "bg-ember"}`}
          style={{
            left: `${positive ? centerPct : valuePct}%`,
            width: `${Math.abs(valuePct - centerPct)}%`,
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[9px] tabular-nums text-zinc-400">
        {db >= 0 ? "+" : ""}
        {db.toFixed(1)}
      </span>
    </div>
  );
}

export default function AdaptiveControlsPanel({
  tweaks,
  onTweak,
  analysis,
  livePreviewParams,
  isAnalyzing,
  isPreviewLoading,
  previewUnavailable,
  previewError,
}) {
  const { t } = useLanguage();

  if (previewUnavailable) return null;

  const gains = livePreviewParams?.per_band_gain_changes_db;

  return (
    <div className="mt-3.5 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("adaptive.title")}</p>
        {isAnalyzing || isPreviewLoading ? <Spinner size={11} /> : null}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{t("adaptive.body")}</p>

      <div className="mt-2.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
        {TWEAKS.map(([key, labelKey]) => (
          <Knob key={key} label={t(labelKey)} value={tweaks[key] ?? 0} min={-1} max={1} step={0.05} onChange={(v) => onTweak(key, v)} size={34} />
        ))}
      </div>

      {!analysis ? (
        <p className="mt-3 border-t border-white/10 pt-2.5 text-[10px] text-zinc-500">{t("adaptive.uploadHint")}</p>
      ) : gains ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:gap-6">
          <div className="flex flex-1 flex-col gap-1">
            {BANDS.map(([key, labelKey]) => (
              <BandBar key={key} label={t(labelKey)} db={gains[key] ?? 0} />
            ))}
          </div>
          <div className="flex shrink-0 flex-col gap-1 text-[10px] sm:w-40">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">{t("adaptive.targetLoudness")}</span>
              <span className="font-semibold tabular-nums text-white">{livePreviewParams.target_lufs?.toFixed(1)} LUFS</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">{t("adaptive.dynamicRange")}</span>
              <span className="font-semibold tabular-nums text-white">{livePreviewParams.target_dynamic_range_db?.toFixed(1)} dB</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">{t("adaptive.stereoWidth")}</span>
              <span className="font-semibold tabular-nums text-white">{livePreviewParams.target_width?.toFixed(2)}×</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-white/10 pt-2.5 text-[10px] text-zinc-500">{previewError || t("adaptive.computing")}</p>
      )}
    </div>
  );
}
