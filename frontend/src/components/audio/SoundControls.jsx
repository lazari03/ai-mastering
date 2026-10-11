"use client";

import { useLanguage } from "@/lib/i18n";

// The reduced "intent" control set (docs/agent-reports/CHIP_CONTRACTS.md K1-K9):
// seven sliders (tweaks), one clarity toggle (tag "clearer") and the 4-way
// character choice (style). Purely presentational: every change goes through
// the same store actions the old chips/sliders used.
const SLIDERS = ["loudness", "punch", "low_end", "warmth", "brightness", "presence", "width"];
// character -> existing API style names (the other 12 styles stay valid server-side)
export const ERAS = [
  ["modern", "modern"],
  ["acoustic_natural", "open"],
  ["electronic_modern", "dense"],
  ["vintage_analog", "vintage"],
];

function Slider({ id, label, line, value, onChange }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-semibold text-text-primary">{label}</label>
        <span className="text-[10px] tabular-nums text-text-secondary">{value > 0 ? "+" : ""}{Math.round(value * 100)}</span>
      </div>
      <div className="relative mt-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-black/[0.06]" />
        <div className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }} />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-text-secondary/40" />
        <input
          id={id}
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={value}
          aria-describedby={`${id}-line`}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(0)}
          className="relative h-5 w-full cursor-pointer appearance-none bg-transparent accent-accent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-accent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow"
        />
      </div>
      <p id={`${id}-line`} className="m-0 text-[11px] leading-snug text-text-secondary">{line}</p>
    </div>
  );
}

export default function SoundControls({ tweaks, onTweak, styles, selectedStyle, onStyle, hasClarity, clarityOn, onToggleClarity, hideSliders = false }) {
  const { t } = useLanguage();
  const eras = ERAS.filter(([style]) => styles.includes(style));
  const isKeptEra = ERAS.some(([style]) => style === selectedStyle);
  const chip = (on) => `rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${on ? "border-accent bg-accent/[0.15] text-accent" : "border-border-subtle bg-black/[0.045] text-text-secondary hover:border-text-primary/30"}`;

  return (
    <div className="flex flex-col gap-4">
      {eras.length ? (
        <div>
          <p className="m-0 text-[12px] font-semibold text-text-primary" id="mc-era-label">{t("mc.k.era")}</p>
          <p className="m-0 mb-1.5 text-[11px] text-text-secondary">{t("mc.k.era.line")}</p>
          <div role="group" aria-labelledby="mc-era-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {eras.map(([style, key]) => (
              <button key={style} type="button" aria-pressed={selectedStyle === style} onClick={() => onStyle(style)} className={chip(selectedStyle === style)}>
                <span className="block">{t(`mc.era.${key}`)}</span>
                <span className="block text-[10px] font-normal leading-snug opacity-80">{t(`mc.era.${key}.hint`)}</span>
              </button>
            ))}
          </div>
          {!isKeptEra && selectedStyle ? <p className="m-0 mt-1.5 text-[11px] text-accent">{t("mc.era.other", { name: selectedStyle.replaceAll("_", " ") })}</p> : null}
        </div>
      ) : null}

      {hideSliders ? null : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {SLIDERS.map((key) => (
            <Slider key={key} id={`mc-${key}`} label={t(`mc.k.${key}`)} line={t(`mc.k.${key}.line`)} value={Number(tweaks[key]) || 0} onChange={(v) => onTweak(key, v)} />
          ))}
        </div>
      )}

      {hasClarity ? (
        <button type="button" aria-pressed={clarityOn} onClick={onToggleClarity} className={`${chip(clarityOn)} w-full sm:w-auto`}>
          <span className="block">{t("mc.k.clarity")}</span>
          <span className="block text-[10px] font-normal leading-snug opacity-80">{t("mc.k.clarity.line")}</span>
        </button>
      ) : null}
    </div>
  );
}
