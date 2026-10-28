"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

function dbToVolume(db) {
  if (!Number.isFinite(db)) return 1;
  return Math.min(1, Math.max(0, 10 ** (db / 20)));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// A/B for the signed-out preview (HeroQuickTry → POST /public/preview).
// "After" is the 30 s mastered excerpt from the server; "Before" is the
// visitor's own file, played straight from the browser (never re-uploaded)
// starting at the same point the excerpt was cut from. Two <audio>
// elements kept in step, so switching is instant and time-aligned.
//
// Loudness-matched by default (ab_gain_match: both gains are <= 0 dB, so
// they map onto element volume): a louder version always *sounds* better,
// and the point of this A/B is to hear the tone and dynamics, not the
// level. The visitor can switch matching off.
export default function PublicPreviewPlayer({ originalFile, previewUrl, startSeconds = 0, gainMatch = null }) {
  const { t } = useLanguage();
  const beforeRef = useRef(null);
  const afterRef = useRef(null);
  const [mode, setMode] = useState("after");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [matched, setMatched] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const completedRef = useRef(false);

  const beforeSrc = useMemo(() => (originalFile ? URL.createObjectURL(originalFile) : null), [originalFile]);
  useEffect(() => () => beforeSrc && URL.revokeObjectURL(beforeSrc), [beforeSrc]);

  const offset = Number.isFinite(startSeconds) ? startSeconds : 0;

  useEffect(() => {
    if (beforeRef.current) beforeRef.current.volume = matched ? dbToVolume(gainMatch?.before_gain_db) : 1;
    if (afterRef.current) afterRef.current.volume = matched ? dbToVolume(gainMatch?.after_gain_db) : 1;
  }, [matched, gainMatch]);

  const active = () => (mode === "after" ? afterRef.current : beforeRef.current);

  // Position in preview time (0..30 s) — the before element runs offset.
  const seekBoth = (previewTime) => {
    if (afterRef.current) afterRef.current.currentTime = previewTime;
    if (beforeRef.current) beforeRef.current.currentTime = offset + previewTime;
    setTime(previewTime);
  };

  const togglePlay = () => {
    const el = active();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => setLoadError(true));
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const swap = (next) => {
    if (next === mode) return;
    const from = active();
    const to = next === "after" ? afterRef.current : beforeRef.current;
    const wasPlaying = from && !from.paused;
    from?.pause();
    if (to) to.currentTime = next === "after" ? time : offset + time;
    setMode(next);
    trackEvent(next === "after" ? "mastered_played" : "original_played", { source: "public_preview" });
    if (wasPlaying && to) to.play().catch(() => {});
  };

  const onTimeUpdate = (event, isAfter) => {
    if ((mode === "after") !== isAfter) return;
    const previewTime = isAfter ? event.currentTarget.currentTime : event.currentTarget.currentTime - offset;
    setTime(Math.max(0, previewTime));
    if (previewTime >= duration - 0.25) {
      event.currentTarget.pause();
      setPlaying(false);
      if (!completedRef.current) {
        completedRef.current = true;
        trackEvent("preview_completed", { source: "public_preview" });
      }
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border-subtle bg-black/[0.045] p-4">
      <audio
        ref={afterRef}
        src={previewUrl}
        preload="auto"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => onTimeUpdate(e, true)}
        onEnded={() => setPlaying(false)}
        onError={() => setLoadError(true)}
      />
      <audio
        ref={beforeRef}
        src={beforeSrc || undefined}
        preload="auto"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = offset;
        }}
        onTimeUpdate={(e) => onTimeUpdate(e, false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("publicPreview.pause") : t("publicPreview.play")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-text-primary text-bg transition hover:opacity-85"
        >
          <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
        </button>
        <div className="inline-flex rounded-full bg-black/[0.06] p-1 text-[12px] font-semibold" role="group" aria-label={t("publicPreview.compare")}>
          {["before", "after"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => swap(key)}
              aria-pressed={mode === key}
              className={`rounded-full px-3.5 py-1.5 transition ${mode === key ? "bg-text-primary text-bg" : "text-text-secondary hover:text-text-primary"}`}
            >
              {t(key === "after" ? "publicPreview.after" : "publicPreview.before")}
            </button>
          ))}
        </div>
        <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-text-secondary">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 30}
        step={0.1}
        value={time}
        onChange={(e) => seekBoth(Number(e.target.value))}
        aria-label={t("publicPreview.seek")}
        className="mt-3 w-full accent-[var(--color-accent,#c2410c)]"
      />

      <label className="mt-2 flex items-center gap-2 text-[12px] text-text-secondary">
        <input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} className="h-3.5 w-3.5" />
        {t("publicPreview.matched")}
      </label>

      {loadError ? <p className="m-0 mt-2 text-[12px] text-red-800">{t("publicPreview.loadError")}</p> : null}
    </div>
  );
}
