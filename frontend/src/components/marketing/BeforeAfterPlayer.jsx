"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/lib/i18n";

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
          gradient.addColorStop(0, "#e85d2a");
          gradient.addColorStop(1, "#dfc95a");
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
    <div
      className={`rounded-2xl border border-white/10 ${large ? "p-6 sm:p-8" : "p-5"}`}
      style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className={`m-0 min-w-0 truncate font-semibold text-white ${large ? "text-base sm:text-lg" : "text-sm"}`}>{label}</p>
          {genre ? (
            <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400">
              {genre}
            </span>
          ) : null}
        </div>

        {/* A/B switch, standard segmented-control shape — reads as one
            control with two states, not two separate buttons, and sits
            with the title instead of eating its own row below. */}
        <div className="flex shrink-0 rounded-full border border-white/15 bg-black/25 p-0.5">
          <button
            type="button"
            onClick={() => swap("before")}
            aria-pressed={mode === "before"}
            className={`rounded-full font-bold uppercase tracking-[0.08em] transition ${large ? "px-4 py-1.5 text-xs" : "px-3 py-1 text-[10px]"} ${
              mode === "before" ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t("demoPlayer.before")}
          </button>
          <button
            type="button"
            onClick={() => swap("after")}
            aria-pressed={mode === "after"}
            className={`rounded-full font-bold uppercase tracking-[0.08em] transition ${large ? "px-4 py-1.5 text-xs" : "px-3 py-1 text-[10px]"} ${
              mode === "after" ? "bg-brass/[0.22] text-brass" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t("demoPlayer.after")}
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className={`mt-4 w-full rounded-xl border border-white/10 bg-black/30 ${large ? "h-32 sm:h-44" : "h-24"}`}
      />

      <div className={`flex items-center gap-3 ${large ? "mt-6" : "mt-4"}`}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ember to-brass text-[#100b08] transition hover:brightness-110 ${
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
            <div className={`w-full rounded-full bg-white/10 ${large ? "h-2.5" : "h-2"}`}>
              <div className="h-full rounded-full bg-gradient-to-r from-ember to-brass" style={{ width: `${progress}%` }} />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-md transition-opacity ${
                large ? "h-4 w-4" : "h-3 w-3"
              } ${scrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ left: `${progress}%` }}
            />
          </div>
          <div className={`mt-1 flex justify-between text-zinc-500 ${large ? "text-xs" : "text-[10px]"}`}>
            <span>{formatTime(scrubbing ? dragRatio * duration : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:text-white"
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
