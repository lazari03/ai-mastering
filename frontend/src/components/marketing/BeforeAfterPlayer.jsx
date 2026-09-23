"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Custom player, not the bare native <audio controls> — a live frequency
// bar visualizer (same Web Audio API approach as SignalVisualizer.jsx:
// one AnalyserNode wired to the <audio> element, canvas redrawn every
// frame) plus a brand-styled play button, seek bar, and the Before/After
// toggle. The <audio> element itself stays hidden; every control here
// drives it programmatically.
export default function BeforeAfterPlayer({ label, genre, beforeSrc, afterSrc, large = false }) {
  const { t } = useLanguage();
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  const [mode, setMode] = useState("after"); // leads with the win
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const swap = (next) => {
    const audio = audioRef.current;
    if (next === mode || !audio) {
      setMode(next);
      return;
    }
    const wasPlaying = !audio.paused;
    const time = audio.currentTime;
    setMode(next);
    requestAnimationFrame(() => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = time;
      if (wasPlaying) audioRef.current.play().catch(() => {});
    });
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const [muted, setMuted] = useState(false);
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  const [scrubbing, setScrubbing] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);

  const ratioFromEvent = (event, rect) => Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));

  // Real drag-to-scrub, not just click-to-seek — the audio element's
  // currentTime is only actually set on release; while dragging, the
  // thumb/fill follow the pointer (dragRatio) instead of the still-stale
  // currentTime, same as any standard media player's seek bar.
  const startScrub = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    setScrubbing(true);
    setDragRatio(ratioFromEvent(event, rect));

    const onMove = (moveEvent) => setDragRatio(ratioFromEvent(moveEvent, rect));
    const onUp = (upEvent) => {
      const finalRatio = ratioFromEvent(upEvent, rect);
      audio.currentTime = finalRatio * duration;
      setScrubbing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Play/pause/time state, mirrored from the hidden <audio> element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  // Web Audio analyser, wired once — an HTMLMediaElement can only ever
  // have createMediaElementSource() called on it a single time (throws on
  // a second call, even across a src swap), so this is mount-only and the
  // Before/After toggle just changes what the already-connected graph is
  // currently analyzing. Same pattern as SignalVisualizer.jsx.
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let frameId = 0;
    let resizeObserver;
    let sourceNode;
    let analyser;
    let audioContext;
    let resumeOnPlay;

    const setup = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;

        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);

        resumeOnPlay = () => {
          if (audioContext.state === "suspended") audioContext.resume();
        };
        audio.addEventListener("play", resumeOnPlay);

        const setCanvasSize = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.floor(rect.width * dpr));
          canvas.height = Math.max(1, Math.floor(rect.height * dpr));
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        setCanvasSize();
        resizeObserver = new ResizeObserver(setCanvasSize);
        resizeObserver.observe(canvas);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const bars = 40;
        const gap = 3;

        const draw = () => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          ctx2d.clearRect(0, 0, width, height);

          const gradient = ctx2d.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, "#8275ff");
          gradient.addColorStop(1, "rgba(130, 117, 255, 0.4)");
          ctx2d.fillStyle = gradient;

          const barWidth = Math.max(2, (width - (bars - 1) * gap) / bars);
          const isPlaying = !audio.paused && !audio.ended;
          if (isPlaying) analyser.getByteFrequencyData(freqData);

          for (let i = 0; i < bars; i++) {
            const dataIndex = Math.floor((i / bars) * freqData.length * 0.75);
            const value = isPlaying ? freqData[dataIndex] / 255 : 0.03;
            const barHeight = Math.max(2, value * height);
            ctx2d.globalAlpha = isPlaying ? 1 : 0.3;
            ctx2d.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight);
          }
          ctx2d.globalAlpha = 1;

          frameId = requestAnimationFrame(draw);
        };
        frameId = requestAnimationFrame(draw);
      } catch {
        // AudioContext blocked/unavailable (rare) — bars stay static, playback is unaffected.
      }
    };

    setup();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) audio.removeEventListener("play", resumeOnPlay);
      if (sourceNode) sourceNode.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext && audioContext.state !== "closed") audioContext.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = (scrubbing ? dragRatio : duration ? currentTime / duration : 0) * 100;

  return (
    <div className={`rounded-2xl border border-border-subtle bg-bg ${large ? "p-6 sm:p-8" : "p-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className={`m-0 min-w-0 truncate font-semibold text-text-primary ${large ? "text-base sm:text-lg" : "text-sm"}`}>{label}</p>
          {genre ? (
            <span className="shrink-0 rounded-full border border-border-subtle px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-text-secondary">
              {genre}
            </span>
          ) : null}
        </div>

        {/* A/B switch, standard segmented-control shape — reads as one
            control with two states, not two separate buttons, and sits
            with the title instead of eating its own row below. */}
        <div className="flex shrink-0 rounded-full border border-border-subtle p-0.5">
          <button
            type="button"
            onClick={() => {
              swap("before");
              trackEvent("original_played", { source: "homepage_demo" });
            }}
            aria-pressed={mode === "before"}
            className={`rounded-full font-semibold uppercase tracking-[0.08em] transition ${large ? "px-4 py-1.5 text-xs" : "px-3 py-1 text-[10px]"} ${
              mode === "before" ? "bg-black/[0.06] text-text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t("demoPlayer.before")}
          </button>
          <button
            type="button"
            onClick={() => {
              swap("after");
              trackEvent("mastered_played", { source: "homepage_demo" });
            }}
            aria-pressed={mode === "after"}
            className={`rounded-full font-semibold uppercase tracking-[0.08em] transition ${large ? "px-4 py-1.5 text-xs" : "px-3 py-1 text-[10px]"} ${
              mode === "after" ? "bg-accent/[0.16] text-text-primary ring-1 ring-inset ring-accent/40" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t("demoPlayer.after")}
          </button>
        </div>
      </div>

      <div
        className={`relative mt-4 overflow-hidden rounded-xl border border-border-subtle bg-black/[0.02] ${large ? "h-32 sm:h-44" : "h-24"}`}
        style={{
          backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.04) 1px, transparent 1px)",
          backgroundSize: "100% 25%, 8.33% 100%",
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
        {/* No text label here — the Before/After toggle above already
            states the mode; repeating it here as well as this pulse dot
            read as a duplicate line of the same words. Just the live
            indicator remains. */}
        {playing ? (
          <span className="pointer-events-none absolute left-2.5 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        ) : null}
      </div>

      <div className={`flex items-center gap-3 ${large ? "mt-6" : "mt-4"}`}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-text-primary text-bg transition hover:opacity-85 ${
            large ? "h-14 w-14 sm:h-16 sm:w-16" : "h-11 w-11"
          }`}
        >
          {playing ? (
            <svg width={large ? "18" : "13"} height={large ? "18" : "13"} viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="4" height="12" />
              <rect x="8" y="1" width="4" height="12" />
            </svg>
          ) : (
            <svg width={large ? "18" : "13"} height={large ? "18" : "13"} viewBox="0 0 14 14" fill="currentColor">
              <path d="M2 1l11 6-11 6V1z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* group + a taller invisible hit-area (py-2) than the visible
              track — standard "generous hit target around a thin track"
              pattern, same reasoning as the app's own transport controls.
              The thumb only appears on hover/drag so the bar reads clean
              at rest, same convention as SoundCloud/YouTube's scrubbers. */}
          <div
            onPointerDown={startScrub}
            className="group relative -my-2 flex cursor-pointer items-center py-2 touch-none"
          >
            <div className={`w-full rounded-full bg-black/10 ${large ? "h-2.5" : "h-2"}`}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-text-primary shadow-md transition-opacity ${
                large ? "h-4 w-4" : "h-3 w-3"
              } ${scrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ left: `${progress}%` }}
            />
          </div>
          <div className={`mt-1 flex justify-between font-mono text-text-secondary ${large ? "text-xs" : "text-[10px]"}`}>
            <span>{formatTime(scrubbing ? dragRatio * duration : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:text-text-primary"
        >
          {muted ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="m17 9 5 6M22 9l-5 6" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M16 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" />
            </svg>
          )}
        </button>
      </div>

      <audio ref={audioRef} src={mode === "before" ? beforeSrc : afterSrc} preload="none" className="hidden" />
    </div>
  );
}
