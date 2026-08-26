"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const EMBER = 0xe85d2a;
const BRASS = 0xdfc95a;

// createMediaElementSource can only ever be called once per <audio>
// element, for that element's whole lifetime — a second call throws
// InvalidStateError. React StrictMode (dev only) mounts this effect,
// cleans it up, then mounts it again synchronously, which would trip
// that exact constraint. Caching the audio graph per element and
// deferring its teardown lets a same-tick remount cancel the close and
// reuse the graph instead of crashing; a real unmount lets the deferred
// close fire and release the AudioContext.
const audioGraphs = new WeakMap();

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setupAudioGraph(audio) {
  let graph = audioGraphs.get(audio);
  if (graph) {
    if (graph.closeTimer) {
      clearTimeout(graph.closeTimer);
      graph.closeTimer = null;
    }
    return graph;
  }
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1;
  const sourceNode = audioContext.createMediaElementSource(audio);
  sourceNode.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(audioContext.destination);
  graph = { audioContext, analyser, gainNode, sourceNode, closeTimer: null };
  audioGraphs.set(audio, graph);
  return graph;
}

function teardownAudioGraph(audio, graph) {
  if (!graph) return;
  graph.closeTimer = setTimeout(() => {
    graph.sourceNode.disconnect();
    graph.analyser.disconnect();
    graph.gainNode.disconnect();
    if (graph.audioContext.state !== "closed") graph.audioContext.close();
    audioGraphs.delete(audio);
  }, 0);
}

/**
 * A real WebGL scene (three.js) whose geometry reacts to the actual
 * frequency content of whatever's playing, plus fully custom Tailwind
 * transport controls.
 *
 * Before/After used to be two <audio> elements + two AudioContexts kept
 * playing in lockstep, switched by ramping gain between them. That turned
 * out to be unreliable in production (two concurrent AudioContexts is
 * exactly the kind of thing mobile Safari/Chrome throttle or cap, on top
 * of always downloading and decoding both files even though only one is
 * ever audible). This version is a single <audio> element / single
 * AudioContext — "switching" swaps its `src` and restores playback
 * position + play state, which is a real ~100-200ms gap instead of an
 * instant crossfade, but it's the same mechanism every normal audio
 * player uses and it doesn't depend on multiple simultaneous
 * AudioContexts working. The file not currently loaded is prefetched
 * with a plain background <audio> (no Web Audio graph) so the swap reads
 * from the browser's HTTP cache instead of a cold fetch.
 */
export default function WebGLMasterPreview({ beforeSrc, afterSrc, afterFallbackSrc, beforeGainDb = 0, afterGainDb = 0, mode = "after", className = "" }) {
  const mountRef = useRef(null);
  const audioRef = useRef(null);
  const graphRef = useRef(null);
  const modeRef = useRef(mode);
  // Which file is actually loaded into the element right now — can lag
  // `mode` by one swap-in-progress, and independently tracks whether the
  // after-track fallback URL had to be used.
  const loadedRef = useRef(null);
  const usedFallback = useRef(false);

  const [activeAfterSrc, setActiveAfterSrc] = useState(afterSrc);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    usedFallback.current = false;
    setActiveAfterSrc(afterSrc);
  }, [afterSrc]);

  const handleError = () => {
    if (modeRef.current !== "after" || usedFallback.current || !afterFallbackSrc || afterFallbackSrc === activeAfterSrc) return;
    usedFallback.current = true;
    setActiveAfterSrc(afterFallbackSrc);
  };

  // Prefetch whichever file isn't currently loaded so the eventual swap
  // reads from HTTP cache instead of starting a fetch from zero.
  useEffect(() => {
    const other = mode === "before" ? activeAfterSrc : beforeSrc;
    if (!other) return undefined;
    const warmer = new Audio();
    warmer.preload = "auto";
    warmer.src = other;
    return () => {
      warmer.src = "";
    };
  }, [mode, beforeSrc, activeAfterSrc]);

  // ---- Three.js scene setup + single Web Audio graph (mount-only) ----
  useEffect(() => {
    const mountEl = mountRef.current;
    const audio = audioRef.current;
    if (!mountEl || !audio) return undefined;

    let renderer;
    let composer;
    let scene;
    let camera;
    let coreMesh;
    let wireMesh;
    let particles;
    let graph;
    let frameId = 0;
    let resizeObserver;
    let resumeOnPlay;
    let disposed = false;

    const baseGeometry = new THREE.IcosahedronGeometry(1.4, 4);
    const basePositions = baseGeometry.attributes.position.array.slice();

    try {
      scene = new THREE.Scene();

      const width = mountEl.clientWidth || 1;
      const height = mountEl.clientHeight || 1;
      camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      camera.position.set(0, 0, 5.4);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      mountEl.appendChild(renderer.domElement);

      const coreMaterial = new THREE.MeshBasicMaterial({
        color: EMBER,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      coreMesh = new THREE.Mesh(baseGeometry, coreMaterial);
      scene.add(coreMesh);

      const wireGeometry = new THREE.IcosahedronGeometry(1.4, 4);
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: BRASS,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      });
      wireMesh = new THREE.Mesh(wireGeometry, wireMaterial);
      scene.add(wireMesh);

      const particleCount = 260;
      const particlePositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i += 1) {
        const radius = 3.2 + Math.random() * 3.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        particlePositions[i * 3 + 2] = radius * Math.cos(phi);
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        color: BRASS,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);

      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.85, 0.6, 0.15);
      composer.addPass(bloomPass);

      const setCanvasSize = () => {
        const w = mountEl.clientWidth || 1;
        const h = mountEl.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
      };
      resizeObserver = new ResizeObserver(setCanvasSize);
      resizeObserver.observe(mountEl);

      graph = setupAudioGraph(audio);
      graphRef.current = graph;
      graph.gainNode.gain.value = modeRef.current === "before" ? 10 ** (beforeGainDb / 20) : 10 ** (afterGainDb / 20);

      resumeOnPlay = () => {
        if (graph.audioContext.state === "suspended") graph.audioContext.resume();
      };
      audio.addEventListener("play", resumeOnPlay);

      const freq = new Uint8Array(graph.analyser.frequencyBinCount);
      const bandAvg = (data, fromFrac, toFrac) => {
        const from = Math.floor(data.length * fromFrac);
        const to = Math.max(from + 1, Math.floor(data.length * toFrac));
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += data[i];
        return sum / ((to - from) * 255);
      };

      const timer = new THREE.Timer();

      const animate = () => {
        if (disposed) return;
        frameId = requestAnimationFrame(animate);
        timer.update();
        const elapsed = timer.getElapsed();

        let bass = 0;
        let mid = 0;
        let treble = 0;
        const playing = !audio.paused && !audio.ended;
        if (playing) {
          graph.analyser.getByteFrequencyData(freq);
          bass = bandAvg(freq, 0.0, 0.12);
          mid = bandAvg(freq, 0.12, 0.4);
          treble = bandAvg(freq, 0.4, 0.85);
        }

        const idlePulse = playing ? 0 : (Math.sin(elapsed * 0.8) + 1) * 0.5 * 0.25;
        const bassLevel = playing ? bass : idlePulse;
        const midLevel = playing ? mid : idlePulse * 0.6;
        const trebleLevel = playing ? treble : idlePulse * 0.4;

        const posAttr = wireGeometry.attributes.position;
        for (let i = 0; i < posAttr.count; i += 1) {
          const ix = i * 3;
          const bx = basePositions[ix];
          const by = basePositions[ix + 1];
          const bz = basePositions[ix + 2];
          const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
          const nx = bx / len;
          const ny = by / len;
          const nz = bz / len;
          const wobble = Math.sin(nx * 4.0 + elapsed * 1.4) * Math.cos(ny * 4.0 + elapsed * 1.1);
          const displacement = 1 + bassLevel * 0.55 + midLevel * 0.28 * wobble + trebleLevel * 0.12 * Math.sin(elapsed * 6 + nz * 8);
          posAttr.array[ix] = nx * 1.4 * displacement;
          posAttr.array[ix + 1] = ny * 1.4 * displacement;
          posAttr.array[ix + 2] = nz * 1.4 * displacement;
        }
        posAttr.needsUpdate = true;

        coreMesh.scale.setScalar(1 + bassLevel * 0.35);
        coreMesh.material.opacity = 0.08 + bassLevel * 0.22;

        wireMesh.rotation.y = elapsed * 0.18;
        wireMesh.rotation.x = Math.sin(elapsed * 0.12) * 0.3;
        coreMesh.rotation.y = wireMesh.rotation.y;
        coreMesh.rotation.x = wireMesh.rotation.x;

        particles.rotation.y = elapsed * 0.04;
        particles.material.size = 0.03 + bassLevel * 0.05;
        particles.material.opacity = 0.35 + trebleLevel * 0.45;

        bloomPass.strength = 0.7 + bassLevel * 0.9;

        camera.position.x = Math.sin(elapsed * 0.08) * 0.3;
        camera.position.y = Math.cos(elapsed * 0.07) * 0.2;
        camera.lookAt(0, 0, 0);

        composer.render();
      };

      animate();
    } catch {
      setWebglFailed(true);
    }

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) audio.removeEventListener("play", resumeOnPlay);
      teardownAudioGraph(audio, graph);
      graphRef.current = null;

      baseGeometry.dispose();
      if (coreMesh) coreMesh.material.dispose();
      if (wireMesh) {
        wireMesh.geometry.dispose();
        wireMesh.material.dispose();
      }
      if (particles) {
        particles.geometry.dispose();
        particles.material.dispose();
      }
      if (composer) composer.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mountEl) mountEl.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The actual Before/After switch: swap `src` on the one element,
  // preserving position and play state. Runs on mount too (initial load). ----
  useEffect(() => {
    modeRef.current = mode;
    const audio = audioRef.current;
    const graph = graphRef.current;
    const targetSrc = mode === "before" ? beforeSrc : activeAfterSrc;
    if (!audio || !targetSrc || loadedRef.current === targetSrc) {
      if (graph) graph.gainNode.gain.value = mode === "before" ? 10 ** (beforeGainDb / 20) : 10 ** (afterGainDb / 20);
      return undefined;
    }

    const wasPlaying = !audio.paused;
    const savedTime = audio.currentTime || 0;
    const firstLoad = loadedRef.current === null;
    loadedRef.current = targetSrc;
    audio.src = targetSrc;

    const onLoaded = () => {
      if (!firstLoad && savedTime > 0 && savedTime < (audio.duration || Infinity)) {
        audio.currentTime = savedTime;
      }
      if (graph) graph.gainNode.gain.value = mode === "before" ? 10 ** (beforeGainDb / 20) : 10 ** (afterGainDb / 20);
      if (wasPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => audio.removeEventListener("loadedmetadata", onLoaded);
  }, [mode, beforeSrc, activeAfterSrc, beforeGainDb, afterGainDb]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const handleSeek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const ratio = Number(event.target.value) / 1000;
    const t = ratio * duration;
    audio.currentTime = t;
    setCurrentTime(t);
  };

  const progressRatio = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-black/40 ${className}`}>
      <div ref={mountRef} className="relative h-64 w-full sm:h-80">
        {webglFailed ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Visualizer unavailable in this browser — playback still works below.
          </div>
        ) : null}
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onError={handleError}
      />

      {/* Fully custom Tailwind transport — no native <audio controls>.
          Touch targets sized for mobile (44px play button, ~44px-tall hit
          area around the thin seek track via the -my-2/py-2 wrapper) since
          this is the exact control set the results page depends on
          working by touch, not just by mouse. */}
      <div className="flex items-center gap-2.5 border-t border-white/10 bg-black/30 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brass/40 bg-gradient-to-br from-ember to-brass text-black shadow-[0_0_16px_rgba(232,93,42,0.35)] transition hover:brightness-110 active:brightness-95"
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="0.5" width="4" height="13" rx="1" />
              <rect x="9" y="0.5" width="4" height="13" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1.5 0.8a1 1 0 0 1 1.53-0.85l9.5 6.2a1 1 0 0 1 0 1.7l-9.5 6.2A1 1 0 0 1 1.5 13.2z" />
            </svg>
          )}
        </button>

        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-400 sm:w-9">{formatTime(currentTime)}</span>

        {/* -my-2/py-2 enlarges the actual touch hit area well past the
            visually thin 4px track, without changing how it looks. */}
        <div className="-my-2 flex-1 py-2">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progressRatio * 1000)}
            onChange={handleSeek}
            className="h-1 w-full cursor-pointer touch-pan-x appearance-none rounded-full bg-white/10 accent-ember"
            style={{
              background: `linear-gradient(to right, var(--ember) ${progressRatio * 100}%, rgba(255,255,255,0.12) ${progressRatio * 100}%)`,
            }}
            aria-label="Seek"
          />
        </div>

        <span className="w-8 shrink-0 text-[10px] tabular-nums text-zinc-400 sm:w-9">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
