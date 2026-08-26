"use client";

import { useEffect, useRef } from "react";

// createMediaElementSource can only ever be called once per <audio>
// element, for that element's whole lifetime — a second call throws
// InvalidStateError. React StrictMode (dev only) mounts this effect,
// cleans it up, then mounts it again synchronously, which would trip
// that exact constraint — and closing an AudioContext while its own
// resume() call is still in flight (started by the first mount, not yet
// settled when the phantom cleanup fires) throws a *second* one:
// "InvalidStateError: Closed before resume completed". Caching the graph
// per element and deferring its teardown lets a same-tick remount cancel
// the close and reuse the graph (resume() keeps running against the
// still-open context) instead of crashing either way; a real unmount
// lets the deferred close fire and release the AudioContext. Same
// pattern as WebGLMasterPreview.jsx.
const audioGraphs = new WeakMap();

export default function SignalVisualizer({ src, className = "", barColor = "#e85d2a", gainDb = 0 }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const gainNodeRef = useRef(null);
  const barColorRef = useRef(barColor);

  // Live-updated without touching the audio graph — see the mount-only
  // effect below for why gainDb/barColor can't be dependencies there.
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.pow(10, gainDb / 20);
    }
  }, [gainDb]);

  useEffect(() => {
    barColorRef.current = barColor;
  }, [barColor]);

  // Mount-only — deliberately no [src, barColor, gainDb] deps. An
  // HTMLMediaElement can have createMediaElementSource() called on it
  // exactly once, ever, even across separate AudioContexts (calling it a
  // second time throws "InvalidStateError: already connected to a
  // different MediaElementSourceNode"). Re-running this on every gainDb/
  // barColor change — which happens once ab_gain_match resolves after
  // mount — was doing exactly that. src changes are handled by React
  // updating the <audio src> attribute directly; the already-connected
  // graph keeps analyzing whatever the element is currently playing.
  useEffect(() => {
    if (!canvasRef.current || !audioRef.current) return;

    const canvas = canvasRef.current;
    const audio = audioRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId = 0;
    let resizeObserver;
    let sourceNode;
    let analyser;
    let gainNode;
    let audioContext;
    let resumeOnPlay;

    let graph;

    const setup = async () => {
      try {
        graph = audioGraphs.get(audio);
        if (graph) {
          // Reused from a same-tick StrictMode remount — cancel its
          // pending deferred close and reuse the existing nodes instead
          // of calling createMediaElementSource again (which would throw).
          if (graph.closeTimer) {
            clearTimeout(graph.closeTimer);
            graph.closeTimer = null;
          }
          ({ audioContext, analyser, gainNode, sourceNode } = graph);
        } else {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.85;

          // Loudness-matches this player against its A/B counterpart (see
          // ab_gain_match from the backend) so neither side of a before/after
          // comparison sounds "better" just because it's louder. Only ever
          // attenuates (gainDb <= 0) — never boosts, so this can't introduce
          // clipping on playback.
          gainNode = audioContext.createGain();
          gainNode.gain.value = Math.pow(10, gainDb / 20);

          sourceNode = audioContext.createMediaElementSource(audio);
          sourceNode.connect(analyser);
          analyser.connect(gainNode);
          gainNode.connect(audioContext.destination);

          graph = { audioContext, analyser, gainNode, sourceNode, closeTimer: null };
          audioGraphs.set(audio, graph);
        }
        gainNodeRef.current = gainNode;

        // AudioContext starts suspended until resumed from a user gesture.
        // Routing the element through createMediaElementSource means nothing
        // is audible until this resume happens, even though the native
        // controls look like they're playing.
        resumeOnPlay = () => {
          if (audioContext.state === "suspended") {
            audioContext.resume();
          }
        };
        audio.addEventListener("play", resumeOnPlay);
        resumeOnPlay();

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const waveData = new Uint8Array(analyser.fftSize);

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

          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          gradient.addColorStop(0, "rgba(232, 93, 42, 0.9)");
          gradient.addColorStop(1, "rgba(223, 201, 90, 0.85)");

          if (!audio.paused && !audio.ended) {
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(waveData);

            const bars = 48;
            const barGap = 2;
            const barWidth = Math.max(2, (width - (bars - 1) * barGap) / bars);

            for (let i = 0; i < bars; i++) {
              const dataIndex = Math.floor((i / bars) * freqData.length * 0.8);
              const value = freqData[dataIndex] / 255;
              const barHeight = Math.max(3, value * (height * 0.48));
              const x = i * (barWidth + barGap);
              const y = height - barHeight;

              ctx.fillStyle = gradient;
              ctx.fillRect(x, y, barWidth, barHeight);
            }

            ctx.beginPath();
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = "rgba(245, 245, 245, 0.85)";
            const sliceWidth = width / waveData.length;

            for (let i = 0; i < waveData.length; i++) {
              const v = waveData[i] / 128.0;
              const y = (v * height) / 3;
              const x = i * sliceWidth;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke();
          } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = barColorRef.current;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height * 0.65);
            ctx.lineTo(width, height * 0.65);
            ctx.stroke();
          }

          frameId = requestAnimationFrame(draw);
        };

        frameId = requestAnimationFrame(draw);
      } catch {
        // Fallback: no analyzer if browser blocks AudioContext or cross-origin source.
      }
    };

    setup();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) audio.removeEventListener("play", resumeOnPlay);
      if (graph) {
        // Deferred: a StrictMode phantom remount within this same tick
        // will find this pending timer and cancel it (see setup above),
        // reusing the graph instead of losing it. A real unmount lets
        // this fire on the next tick and actually release the nodes —
        // by then any resume() the first mount kicked off has settled,
        // so close() can't race it into "Closed before resume completed".
        graph.closeTimer = setTimeout(() => {
          sourceNode.disconnect();
          analyser.disconnect();
          gainNode.disconnect();
          if (audioContext.state !== "closed") audioContext.close();
          audioGraphs.delete(audio);
        }, 0);
      }
      gainNodeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`space-y-2 ${className}`}>
      <canvas ref={canvasRef} className="h-28 w-full rounded-lg border border-white/10 bg-black/30" />
      <audio ref={audioRef} controls src={src} crossOrigin="anonymous" className="w-full" />
    </div>
  );
}
