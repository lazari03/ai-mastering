"use client";

import { useEffect, useRef, useState } from "react";

const BAR_W = 3;
const BAR_GAP = 2;
const PEAK_RES = 1200; // envelope points per track, resampled to the bar count at draw time
const XFADE_TC = 0.012; // setTargetAtTime constant — the A/B crossfade settles in ~50ms, no click
const IDLE_BAR = "rgba(17,17,17,0.13)";

// createMediaElementSource can only ever be called once per <audio>
// element, for that element's whole lifetime. React StrictMode (dev only)
// mounts, cleans up, then remounts synchronously — caching the graph per
// element and deferring its teardown lets that remount cancel the close
// and reuse it; a real unmount lets the close fire. Same pattern as
// SignalVisualizer.jsx.
const audioGraphs = new WeakMap();

function getGraph(audio) {
  let graph = audioGraphs.get(audio);
  if (graph) {
    if (graph.closeTimer) {
      clearTimeout(graph.closeTimer);
      graph.closeTimer = null;
    }
    return graph;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;
  analyser.connect(ctx.destination);
  const elGain = ctx.createGain();
  const elSource = ctx.createMediaElementSource(audio);
  elSource.connect(elGain);
  elGain.connect(analyser);
  const bufGain = { before: ctx.createGain(), after: ctx.createGain() };
  for (const node of Object.values(bufGain)) {
    node.gain.value = 0;
    node.connect(analyser);
  }
  graph = { ctx, analyser, elGain, elSource, bufGain, closeTimer: null };
  audioGraphs.set(audio, graph);
  return graph;
}

function releaseGraph(audio, graph) {
  graph.closeTimer = setTimeout(() => {
    graph.elSource.disconnect();
    graph.elGain.disconnect();
    graph.bufGain.before.disconnect();
    graph.bufGain.after.disconnect();
    graph.analyser.disconnect();
    if (graph.ctx.state !== "closed") graph.ctx.close();
    audioGraphs.delete(audio);
  }, 0);
}

// RMS envelope rather than peaks: a mastered file's peaks sit flat against
// the ceiling, so a peak view would only show a solid block. RMS shows the
// density and loudness change the master actually made.
function rmsEnvelope(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const out = new Float32Array(PEAK_RES);
  const step = buffer.length / PEAK_RES;
  for (let i = 0; i < PEAK_RES; i += 1) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    const stride = Math.max(1, Math.floor((to - from) / 400));
    let sum = 0;
    let count = 0;
    for (const data of channels) {
      for (let j = from; j < to; j += stride) {
        sum += data[j] * data[j];
        count += 1;
      }
    }
    out[i] = Math.sqrt(sum / (count || 1));
  }
  return out;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const dbToGain = (db) => 10 ** (db / 20);

/**
 * Before/After player for a finished master.
 *
 * Switching used to swap the <audio> element's src — a re-fetch and
 * re-buffer of a full-length WAV on every toggle, which is the lag people
 * heard. Now both files are fetched and decoded into AudioBuffers on one
 * AudioContext, played in sample-locked sync through two gain nodes, and
 * Before/After is a ~50ms gain crossfade: no network, no seek, no gap.
 *
 * Decoding takes a few seconds, so playback starts on the streaming
 * <audio> element (as before) and hands over to the buffers at the first
 * switch/play/seek after they're ready. If decoding fails (memory, an old
 * browser) the element path simply keeps working as it always did.
 *
 * The visual is the track's own loudness envelope — the currently
 * selected version's, so flipping to After shows the bars morph into the
 * master. It doubles as the seek bar.
 */
export default function ABMasterPlayer({
  beforeSrc,
  afterSrc,
  afterFallbackSrc,
  beforeGainDb = 0,
  afterGainDb = 0,
  beforeLabel = "Before",
  afterLabel = "After",
  preparingLabel = "preparing instant A/B…",
  onModeChange,
  className = "",
}) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const [mode, setModeState] = useState("after");
  const [activeAfterSrc, setActiveAfterSrc] = useState(afterSrc);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  // Everything the audio engine and the draw loop read lives in one ref, so
  // neither has to re-subscribe on React state changes.
  const eng = useRef({
    graph: null,
    mode: "after",
    gainsDb: { before: 0, after: 0 },
    buffers: null, // { before, after } once decoded
    envelopes: null, // { before, after }, normalized to a shared scale
    usingBuffers: false,
    sources: [],
    startCtx: 0,
    offset: 0,
    playing: false,
    duration: 0,
    loadedSrc: null,
    usedFallback: false,
    scrub: null, // 0..1 while dragging on the waveform
  });
  eng.current.gainsDb = { before: beforeGainDb, after: afterGainDb };

  const position = () => {
    const e = eng.current;
    if (e.usingBuffers) return e.playing ? e.offset + Math.max(0, e.graph.ctx.currentTime - e.startCtx) : e.offset;
    return audioRef.current?.currentTime || 0;
  };

  const applyGains = (immediate) => {
    const e = eng.current;
    const g = e.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    for (const which of ["before", "after"]) {
      const param = g.bufGain[which].gain;
      const target = e.usingBuffers && which === e.mode ? dbToGain(e.gainsDb[which]) : 0;
      param.cancelScheduledValues(now);
      if (immediate) {
        param.setValueAtTime(target, now);
      } else {
        param.setValueAtTime(param.value, now);
        param.setTargetAtTime(target, now, XFADE_TC);
      }
    }
    g.elGain.gain.value = e.usingBuffers ? 0 : dbToGain(e.gainsDb[e.mode]);
  };

  const stopSources = () => {
    const e = eng.current;
    for (const src of e.sources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    }
    e.sources = [];
  };

  const startSources = (at) => {
    const e = eng.current;
    const { ctx, bufGain } = e.graph;
    stopSources();
    const when = ctx.currentTime + 0.01;
    for (const which of ["before", "after"]) {
      const buf = e.buffers[which];
      if (at >= buf.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(bufGain[which]);
      src.start(when, at);
      e.sources.push(src);
    }
    e.startCtx = when;
    e.offset = at;
    e.playing = true;
  };

  // Moves playback from the streaming element onto the decoded buffers,
  // at the element's current position and play state.
  const handoff = () => {
    const e = eng.current;
    const audio = audioRef.current;
    if (e.usingBuffers || !e.buffers || !audio) return;
    const wasPlaying = !audio.paused;
    e.usingBuffers = true;
    e.offset = audio.currentTime || 0;
    audio.pause();
    applyGains(true);
    if (wasPlaying) startSources(e.offset);
  };

  const play = () => {
    const e = eng.current;
    if (!e.graph) return;
    if (e.graph.ctx.state === "suspended") e.graph.ctx.resume();
    handoff();
    if (e.usingBuffers) {
      if (e.offset >= e.duration - 0.05) e.offset = 0;
      applyGains(true);
      startSources(e.offset);
      setIsPlaying(true);
    } else {
      audioRef.current?.play().catch(() => {});
    }
  };

  const pause = () => {
    const e = eng.current;
    if (e.usingBuffers) {
      e.offset = position();
      stopSources();
      e.playing = false;
      setIsPlaying(false);
    } else {
      audioRef.current?.pause();
    }
  };

  const seek = (t) => {
    const e = eng.current;
    const clamped = Math.max(0, Math.min(t, e.duration || 0));
    handoff();
    if (e.usingBuffers) {
      if (e.playing) startSources(clamped);
      else e.offset = clamped;
    } else if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const setMode = (next) => {
    const e = eng.current;
    if (next === e.mode) return;
    e.mode = next;
    setModeState(next);
    onModeChange?.(next);
    handoff();
    if (e.usingBuffers) applyGains(false);
  };

  // ---- Audio graph + draw loop (mount-only) ----
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return undefined;
    const e = eng.current;
    let graph;
    try {
      graph = getGraph(audio);
      e.graph = graph;
      applyGains(true);
    } catch {
      // No Web Audio: the bare element still plays.
    }

    const ctx2d = canvas.getContext("2d");
    const styles = getComputedStyle(document.documentElement);
    const colors = {
      after: styles.getPropertyValue("--accent").trim() || "#8275ff",
      before: styles.getPropertyValue("--text-primary").trim() || "#111111",
    };
    let heights = new Float32Array(0);
    const levelData = graph ? new Uint8Array(graph.analyser.frequencyBinCount) : null;
    let level = 0;
    let frameId = 0;
    let lastUiUpdate = 0;
    let lastUiTime = -1;
    const start = performance.now();

    const draw = (now) => {
      frameId = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);

      const pos = position();
      if (e.usingBuffers && e.playing && pos >= e.duration) {
        stopSources();
        e.playing = false;
        e.offset = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      }
      if (now - lastUiUpdate > 120 && Math.abs(pos - lastUiTime) > 0.05) {
        lastUiUpdate = now;
        lastUiTime = pos;
        setCurrentTime(pos);
      }

      const n = Math.max(12, Math.floor((w + BAR_GAP) / (BAR_W + BAR_GAP)));
      if (heights.length !== n) heights = new Float32Array(n);
      const env = e.envelopes?.[e.mode];
      const t = (now - start) / 1000;
      for (let k = 0; k < n; k += 1) {
        let target;
        if (env) {
          const from = Math.floor((k / n) * env.length);
          const to = Math.max(from + 1, Math.floor(((k + 1) / n) * env.length));
          let sum = 0;
          for (let i = from; i < to; i += 1) sum += env[i];
          target = 0.04 + 0.96 * (sum / (to - from));
        } else {
          // Loading: a quiet wave travelling across the bars.
          target = 0.1 + 0.08 * (Math.sin(t * 2.4 - k * 0.22) + 1);
        }
        heights[k] += (target - heights[k]) * 0.14;
      }

      const progress = e.scrub ?? (e.duration > 0 ? pos / e.duration : 0);
      const playedX = progress * w;

      // The few bars under the playhead breathe with what's actually
      // coming out of the speakers — the only live motion on the panel.
      const audible = e.usingBuffers ? e.playing : audioRef.current && !audioRef.current.paused;
      let rawLevel = 0;
      if (audible && levelData) {
        graph.analyser.getByteFrequencyData(levelData);
        let sum = 0;
        for (let i = 0; i < levelData.length; i += 1) sum += levelData[i];
        rawLevel = sum / (levelData.length * 255);
      }
      level += (rawLevel - level) * 0.3;
      const headBar = playedX / (BAR_W + BAR_GAP);
      const active = colors[e.mode];
      for (let k = 0; k < n; k += 1) {
        const x = k * (BAR_W + BAR_GAP);
        const near = Math.max(0, 1 - Math.abs(k - headBar) / 4);
        const bh = Math.min(h, Math.max(2, heights[k] * h * 0.92 * (1 + near * level * 0.9)));
        const y = (h - bh) / 2;
        ctx2d.fillStyle = x + BAR_W / 2 <= playedX && (env || pos > 0) ? active : IDLE_BAR;
        ctx2d.beginPath();
        if (ctx2d.roundRect) ctx2d.roundRect(x, y, BAR_W, bh, 1.5);
        else ctx2d.rect(x, y, BAR_W, bh);
        ctx2d.fill();
      }
    };
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      stopSources();
      e.playing = false;
      if (graph) releaseGraph(audio, graph);
      e.graph = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyGains(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeGainDb, afterGainDb]);

  useEffect(() => {
    eng.current.usedFallback = false;
    setActiveAfterSrc(afterSrc);
  }, [afterSrc]);

  // ---- Decode both files for instant A/B ----
  useEffect(() => {
    const e = eng.current;
    if (!e.graph || !beforeSrc || !activeAfterSrc) return undefined;
    // Two full-length decoded tracks are real memory; on a device that
    // reports being this small, stay on the streaming element.
    if (typeof navigator !== "undefined" && navigator.deviceMemory && navigator.deviceMemory < 2) return undefined;
    let cancelled = false;
    const { ctx } = e.graph;
    const load = async (url, fallback) => {
      let res = await fetch(url);
      if (!res.ok && fallback && fallback !== url) res = await fetch(fallback);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
    };
    Promise.all([load(beforeSrc), load(activeAfterSrc, afterFallbackSrc)])
      .then(([before, after]) => {
        if (cancelled) return;
        const envBefore = rmsEnvelope(before);
        const envAfter = rmsEnvelope(after);
        let max = 1e-6;
        for (const env of [envBefore, envAfter]) for (const v of env) if (v > max) max = v;
        for (const env of [envBefore, envAfter]) for (let i = 0; i < env.length; i += 1) env[i] /= max;
        e.buffers = { before, after };
        e.envelopes = { before: envBefore, after: envAfter };
        e.duration = Math.max(before.duration, after.duration);
        setDuration(e.duration);
        setReady(true);
      })
      .catch(() => {
        // Keep the streaming element path.
      });
    return () => {
      cancelled = true;
    };
  }, [beforeSrc, activeAfterSrc, afterFallbackSrc]);

  // ---- Streaming path: load the selected file into the element (until handoff) ----
  useEffect(() => {
    const e = eng.current;
    const audio = audioRef.current;
    const targetSrc = mode === "before" ? beforeSrc : activeAfterSrc;
    if (e.usingBuffers || !audio || !targetSrc || e.loadedSrc === targetSrc) return undefined;
    const wasPlaying = !audio.paused;
    const savedTime = audio.currentTime || 0;
    const firstLoad = e.loadedSrc === null;
    e.loadedSrc = targetSrc;
    audio.src = targetSrc;
    applyGains(true);
    const onLoaded = () => {
      if (!firstLoad && savedTime > 0 && savedTime < (audio.duration || Infinity)) audio.currentTime = savedTime;
      if (wasPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => audio.removeEventListener("loadedmetadata", onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, beforeSrc, activeAfterSrc]);

  const handleError = () => {
    const e = eng.current;
    if (e.mode !== "after" || e.usedFallback || !afterFallbackSrc || afterFallbackSrc === activeAfterSrc) return;
    e.usedFallback = true;
    setActiveAfterSrc(afterFallbackSrc);
  };

  // ---- Waveform as seek bar ----
  const ratioAt = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };
  const onPointerDown = (event) => {
    if (!eng.current.duration && !audioRef.current?.duration) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    eng.current.scrub = ratioAt(event);
  };
  const onPointerMove = (event) => {
    if (eng.current.scrub !== null) eng.current.scrub = ratioAt(event);
  };
  const onPointerUp = (event) => {
    const e = eng.current;
    if (e.scrub === null) return;
    const dur = e.duration || audioRef.current?.duration || 0;
    seek(ratioAt(event) * dur);
    e.scrub = null;
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") seek(position() + 5);
    else if (event.key === "ArrowLeft") seek(position() - 5);
    else if (event.key === " ") (isPlaying ? pause : play)();
    else return;
    event.preventDefault();
  };

  const segment = (value, label) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => setMode(value)}
      className={`rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200 ${
        mode === value ? (value === "after" ? "bg-accent text-white" : "bg-text-primary text-bg") : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`rounded-2xl bg-black/[0.03] ring-1 ring-inset ring-black/[0.06] ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
        <p className="m-0 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
          {mode === "after" ? afterLabel : beforeLabel}
          {!ready ? <span className="normal-case tracking-normal"> · {preparingLabel}</span> : null}
        </p>
        <div role="radiogroup" aria-label="Compare" className="inline-flex rounded-full bg-black/[0.05] p-0.5">
          {segment("before", beforeLabel)}
          {segment("after", afterLabel)}
        </div>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="mx-4 my-3 h-28 cursor-pointer touch-none select-none rounded-lg sm:mx-5 sm:h-32"
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="auto"
        className="hidden"
        onPlay={() => !eng.current.usingBuffers && setIsPlaying(true)}
        onPause={() => !eng.current.usingBuffers && setIsPlaying(false)}
        onEnded={() => !eng.current.usingBuffers && setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          if (!eng.current.buffers) {
            eng.current.duration = event.currentTarget.duration || 0;
            setDuration(eng.current.duration);
          }
        }}
        onError={handleError}
      />

      <div className="flex items-center gap-3 px-4 pb-4 sm:px-5">
        <button
          type="button"
          onClick={() => (isPlaying ? pause() : play())}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-text-primary text-bg transition-transform duration-200 active:scale-95"
        >
          {isPlaying ? (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1.5" y="0.5" width="3.8" height="13" rx="1" />
              <rect x="8.7" y="0.5" width="3.8" height="13" rx="1" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <path d="M2.5 0.8a1 1 0 0 1 1.53-0.85l9 6.2a1 1 0 0 1 0 1.7l-9 6.2A1 1 0 0 1 2.5 13.2z" />
            </svg>
          )}
        </button>
        <span className="font-mono text-[12px] tabular-nums text-text-secondary">
          {formatTime(currentTime)} <span className="opacity-50">/</span> {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
