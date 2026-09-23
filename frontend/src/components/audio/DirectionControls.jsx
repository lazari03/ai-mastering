"use client";

import { useState } from "react";

import { TONES, INTENSITIES, LOUDNESS_LEVELS, TONE_CURVES, curvePath } from "@/domain/mastering/directions";
import { useLanguage } from "@/lib/i18n";

// Direction controls: tone cards + intensity + loudness, with a Fine-tune
// drawer exposing the 7 underlying engine tweaks. Controlled — the console
// feeds it the store, the My Presets editor feeds it a local draft.

const FINE_TUNE = [
  ["low_end", "adaptive.tweak.lowEnd", "direction.fine.lowEnd"],
  ["punch", "adaptive.tweak.punch", "direction.fine.punch"],
  ["warmth", "adaptive.tweak.warmth", "direction.fine.warmth"],
  ["presence", "adaptive.tweak.presence", "direction.fine.presence"],
  ["brightness", "adaptive.tweak.brightness", "direction.fine.brightness"],
  ["width", "adaptive.tweak.width", "direction.fine.width"],
  ["loudness", "adaptive.tweak.loudness", "direction.fine.loudness"],
];

function ToneGlyph({ tone, active }) {
  const line = curvePath(TONE_CURVES[tone] || TONE_CURVES.balanced);
  return (
    <svg viewBox="0 0 64 24" preserveAspectRatio="none" className={`h-9 w-full ${active ? "text-accent" : "text-text-secondary"}`} aria-hidden="true">
      <line x1="0" y1="12" x2="64" y2="12" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <path d={`${line} L 64 24 L 0 24 Z`} fill="currentColor" fillOpacity={active ? 0.16 : 0.07} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Segmented({ label, options, value, onChange, disabled, renderLabel }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.1em] text-text-secondary">{label}</span>
      <div role="radiogroup" aria-label={label} className={`grid rounded-xl border border-border-subtle bg-black/[0.045] p-0.5 ${disabled ? "opacity-45" : ""}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`rounded-[10px] px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed ${
                active ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {renderLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FineSlider({ id, label, hint, value, onChange }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-semibold text-text-primary">
          {label}
        </label>
        <span className="text-[10px] tabular-nums text-text-secondary">
          {value > 0 ? "+" : ""}
          {Math.round(value * 100)}
        </span>
      </div>
      <div className="relative mt-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-black/[0.06]" />
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-text-secondary/40" />
        <input
          id={id}
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(0)}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent accent-accent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-accent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow"
        />
      </div>
      <p className="m-0 mt-0.5 text-[10px] leading-snug text-text-secondary">{hint}</p>
    </div>
  );
}

export default function DirectionControls({ direction, tweaks, onDirection, onTweak, onReset, idPrefix = "dir", defaultOpen = false }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const custom = direction.tone === "custom";

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("direction.tone")}</span>
        {custom ? (
          <span className="rounded-full border border-accent/40 bg-accent/[0.1] px-2 py-0.5 text-[10px] font-semibold text-accent">{t("direction.customBadge")}</span>
        ) : null}
      </div>
      <div role="radiogroup" aria-label={t("direction.tone")} className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TONES.map((tone) => {
          const active = direction.tone === tone;
          return (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onDirection({ tone })}
              className={`group flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${
                active
                  ? "border-accent bg-accent/[0.1] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
                  : "border-border-subtle bg-black/[0.03] hover:border-text-primary/25 hover:bg-black/[0.05]"
              }`}
            >
              <ToneGlyph tone={tone} active={active} />
              <span className={`text-[12px] font-bold ${active ? "text-accent" : "text-text-primary"}`}>{t(`direction.tone.${tone}`)}</span>
              <span className="text-[10px] leading-snug text-text-secondary">{t(`direction.tone.${tone}.hint`)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Segmented
          label={t("direction.intensity")}
          options={INTENSITIES}
          value={direction.intensity}
          disabled={custom || direction.tone === "balanced"}
          onChange={(intensity) => onDirection({ intensity })}
          renderLabel={(o) => t(`direction.intensity.${o}`)}
        />
        <Segmented
          label={t("direction.loudness")}
          options={LOUDNESS_LEVELS}
          value={direction.loudness}
          onChange={(loudness) => onDirection({ loudness })}
          renderLabel={(o) => t(`direction.loudness.${o}`)}
        />
      </div>

      <div className="mt-3 rounded-xl border border-border-subtle">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${idPrefix}-fine`}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary"
          >
            <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
              ›
            </span>
            {t("direction.fineTune")}
          </button>
          {onReset ? (
            <button type="button" onClick={onReset} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary hover:text-accent">
              {t("direction.reset")}
            </button>
          ) : null}
        </div>
        {open ? (
          <div id={`${idPrefix}-fine`} className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border-subtle px-3 py-3 sm:grid-cols-2">
            {FINE_TUNE.map(([key, labelKey, hintKey]) => (
              <FineSlider
                key={key}
                id={`${idPrefix}-${key}`}
                label={t(labelKey)}
                hint={t(hintKey)}
                value={Number(tweaks[key]) || 0}
                onChange={(v) => onTweak(key, v)}
              />
            ))}
            <p className="m-0 text-[10px] text-text-secondary sm:col-span-2">{t("direction.fineTuneNote")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
