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
export default function BeforeAfterPlayer({ label, genre, beforeSrc, afterSrc }) {
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

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
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

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="rounded-2xl border border-white/10 p-5"
      style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 min-w-0 text-sm font-semibold text-white">{label}</p>
        {genre ? (
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400">
            {genre}
          </span>
        ) : null}
      </div>

      <canvas ref={canvasRef} className="mt-4 h-24 w-full rounded-xl border border-white/10 bg-black/30" />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ember to-brass text-[#100b08] transition hover:brightness-110"
        >
          {playing ? (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="4" height="12" />
              <rect x="8" y="1" width="4" height="12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <path d="M2 1l11 6-11 6V1z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div onClick={seek} className="h-2 w-full cursor-pointer rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-ember to-brass" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => swap("before")}
          aria-pressed={mode === "before"}
          className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
            mode === "before" ? "border-white/40 bg-white/10 text-white" : "border-white/15 bg-black/20 text-zinc-400 hover:border-white/30"
          }`}
        >
          {t("demoPlayer.before")}
        </button>
        <button
          type="button"
          onClick={() => swap("after")}
          aria-pressed={mode === "after"}
          className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
            mode === "after" ? "border-brass bg-brass/[0.18] text-brass" : "border-white/15 bg-black/20 text-zinc-400 hover:border-white/30"
          }`}
        >
          {t("demoPlayer.after")}
        </button>
      </div>

      <audio ref={audioRef} src={mode === "before" ? beforeSrc : afterSrc} preload="none" className="hidden" />
    </div>
  );
}
