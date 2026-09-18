"use client";

import { useEffect, useRef } from "react";

// Same StrictMode-safe audio-graph caching pattern as SignalVisualizer.jsx
// — see that file's comment for the full "why" (createMediaElementSource
// can only ever be called once per <audio> element; deferred teardown
// lets a same-tick dev-mode remount reuse the graph instead of crashing).
const audioGraphs = new WeakMap();

/**
 * A standalone, reusable frequency-bar visualizer — unlike
 * SignalVisualizer.jsx (which owns its own visible <audio controls>),
 * this renders a hidden, muted, looping <audio> internally and is meant
 * to be dropped in as a decorative background visual (e.g. behind the
 * hero headline) or wherever a "this product works with real audio"
 * moment is needed without full transport controls. Real frequency data
 * from a real AnalyserNode — not a randomized/fake animation.
 */
export default function SpectrumAnalyzer({
  src,
  className = "",
  bars = 48,
  barGap = 2,
  // Accent (#8275FF) is the one spot the color-system spec explicitly
  // calls out an active waveform as a good use of it — monochrome
  // gradient, not the old ember-to-brass two-tone, so it reads as "one
  // small precise accent," not a colorful illustration.
  colorFrom = "rgba(130, 117, 255, 0.9)",
  colorTo = "rgba(130, 117, 255, 0.35)",
  idleOpacity = 0.12,
}) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !audioRef.current || !src) return undefined;

    const canvas = canvasRef.current;
    const audio = audioRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let frameId = 0;
    let resizeObserver;
    let sourceNode;
    let analyser;
    let audioContext;
    let resumeOnPlay;
    let tryPlay;
    let graph;

    const setup = async () => {
      try {
        graph = audioGraphs.get(audio);
        if (graph) {
          if (graph.closeTimer) {
            clearTimeout(graph.closeTimer);
            graph.closeTimer = null;
          }
          ({ audioContext, analyser, sourceNode } = graph);
        } else {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.82;

          sourceNode = audioContext.createMediaElementSource(audio);
          // Deliberately NOT connected onward to audioContext.destination
          // — this is a decorative, always-muted background visual, never
          // meant to be audible. Relying on the <audio> element's own
          // `muted` attribute isn't safe once routed through
          // createMediaElementSource (whether the element's mute/volume
          // still applies as a pre-graph stage is inconsistent across
          // browsers); simply never wiring the graph to an output is the
          // one guarantee that actually holds regardless of browser.
          // Playback still advances and the analyser still gets real
          // frequency data either way — audibility and analysis are
          // independent of whether the chain reaches destination.
          sourceNode.connect(analyser);

          graph = { audioContext, analyser, sourceNode, closeTimer: null };
          audioGraphs.set(audio, graph);
        }

        resumeOnPlay = () => {
          if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        };
        audio.addEventListener("play", resumeOnPlay);
        // Belt-and-suspenders: set muted imperatively too, not just via
        // the JSX prop below — muted playback is what makes autoplay
        // without a user gesture allowed, which is what makes this safe
        // to use as a decorative background visual. The element's source
        // isn't always ready the instant this effect runs (cached graph
        // reuse vs. a fresh element), so play() can reject once here —
        // retry once the browser says it's actually ready to play.
        audio.muted = true;
        tryPlay = () => audio.play().catch(() => {});
        tryPlay();
        audio.addEventListener("canplay", tryPlay);

        const freqData = new Uint8Array(analyser.frequencyBinCount);

        const setCanvasSize = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.floor(rect.width * dpr));
          canvas.height = Math.max(1, Math.floor(rect.height * dpr));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        setCanvasSize();
        resizeObserver = new ResizeObserver(setCanvasSize);
        resizeObserver.observe(canvas);

        const draw = () => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          ctx.clearRect(0, 0, width, height);

          const gradient = ctx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, colorFrom);
          gradient.addColorStop(1, colorTo);

          const playing = !audio.paused && !audio.ended;
          if (playing) analyser.getByteFrequencyData(freqData);

          const barWidth = Math.max(2, (width - (bars - 1) * barGap) / bars);
          for (let i = 0; i < bars; i++) {
            const dataIndex = Math.floor((i / bars) * freqData.length * 0.8);
            const value = playing ? freqData[dataIndex] / 255 : 0;
            const barHeight = Math.max(2, value * height);
            const x = i * (barWidth + barGap);
            ctx.globalAlpha = playing ? 1 : idleOpacity;
            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
          }
          ctx.globalAlpha = 1;

          frameId = requestAnimationFrame(draw);
        };
        frameId = requestAnimationFrame(draw);
      } catch {
        // AudioContext blocked/unavailable — canvas just stays empty,
        // never blocks anything else on the page.
      }
    };

    setup();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) audio.removeEventListener("play", resumeOnPlay);
      if (tryPlay) audio.removeEventListener("canplay", tryPlay);
      if (graph) {
        graph.closeTimer = setTimeout(() => {
          sourceNode.disconnect();
          analyser.disconnect();
          // resume() from resumeOnPlay above can still be in flight —
          // closing mid-resume throws "Closed before resume completed"
          // (a real, observed crash, not hypothetical). Swallow it: the
          // context is being torn down either way.
          if (audioContext.state !== "closed") audioContext.close().catch(() => {});
          audioGraphs.delete(audio);
        }, 0);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} muted loop playsInline crossOrigin="anonymous" className="hidden" />
    </div>
  );
}
