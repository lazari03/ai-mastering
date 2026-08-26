"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const EMBER = 0xe85d2a;
const BRASS = 0xdfc95a;

// A short ramp instead of an instant gain jump — avoids an audible click/
// pop on every Before/After flip, same reasoning a real analog A/B switch
// on a mastering desk is built to avoid.
const GAIN_RAMP_S = 0.03;
// If the two elements' positions drift apart by more than this while both
// are playing (independent decode timing, not something driven directly),
// snap the trailing one back in sync — cheap insurance, not expected to
// fire often since both files are the same length and started together.
const DRIFT_RESYNC_S = 0.2;

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

// Sets up (or reuses, see audioGraphs above) a MediaElementSource -> gain
// -> analyser -> destination graph for one <audio> element. Both Before
// and After each get their own of these — see the component doc comment
// for why that's what makes the Before/After switch instant.
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
  gainNode.gain.value = 0;
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
  // Deferred: a StrictMode phantom remount within this same tick will
  // find this pending timer and cancel it (see setupAudioGraph), reusing
  // the graph instead of losing it. A real unmount lets this fire on the
  // next tick and actually release the nodes.
  graph.closeTimer = setTimeout(() => {
    graph.sourceNode.disconnect();
    graph.analyser.disconnect();
    graph.gainNode.disconnect();
    if (graph.audioContext.state !== "closed") graph.audioContext.close();
    audioGraphs.delete(audio);
  }, 0);
}

/**
 * The "cooler" replacement for SignalVisualizer's flat canvas bars — a real
 * WebGL scene (three.js) whose geometry reacts to the actual frequency
 * content of whatever's audible, plus fully custom Tailwind transport
 * controls instead of the native <audio controls> UI. Built for the
 * dedicated post-mastering results page.
 *
 * Before/After is a real-time switch, not a reload: both files are loaded
 * into their own <audio> element and kept playing in lockstep the whole
 * time (play/pause/seek always apply to both together) — "switching"
 * just ramps one element's gain up and the other's down, so playback
 * position and play/pause state never reset and there's no gap to listen
 * through. That's what makes it possible to actually hear what changed —
 * a reload-based swap (the previous version of this component) restarts
 * from 0 and drops whatever you were mid-comparing.
 */
export default function WebGLMasterPreview({ beforeSrc, afterSrc, afterFallbackSrc, beforeGainDb = 0, afterGainDb = 0, mode = "after", className = "" }) {
  const mountRef = useRef(null);
  const beforeAudioRef = useRef(null);
  const afterAudioRef = useRef(null);
  const beforeGainNodeRef = useRef(null);
  const afterGainNodeRef = useRef(null);
  const modeRef = useRef(mode);
  // Whether `afterSrc` has already been swapped to afterFallbackSrc after
  // failing to load (a 16-bit browser-preview copy that 404s — e.g. an
  // older job rendered before that copy existed, or a rare failed
  // transcode) — a ref, not state, purely to make the onError handler
  // idempotent without adding a render-triggering update to the hot path.
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

  const handleAfterError = () => {
    if (usedFallback.current || !afterFallbackSrc || afterFallbackSrc === activeAfterSrc) return;
    usedFallback.current = true;
    setActiveAfterSrc(afterFallbackSrc);
  };

  // Ramps both gain nodes toward "mode's target is audible, the other is
  // silent" — runs on mount (once the graph exists) and every time `mode`
  // or the loudness-match targets change. This is the actual Before/After
  // switch; nothing about playback position or play state is touched.
  useEffect(() => {
    modeRef.current = mode;
    const beforeGain = beforeGainNodeRef.current;
    const afterGain = afterGainNodeRef.current;
    if (!beforeGain || !afterGain) return;
    const now = beforeGain.context.currentTime;
    const beforeTarget = mode === "before" ? 10 ** (beforeGainDb / 20) : 0;
    const afterTarget = mode === "after" ? 10 ** (afterGainDb / 20) : 0;
    beforeGain.gain.cancelScheduledValues(now);
    beforeGain.gain.setValueAtTime(beforeGain.gain.value, now);
    beforeGain.gain.linearRampToValueAtTime(beforeTarget, now + GAIN_RAMP_S);
    afterGain.gain.cancelScheduledValues(now);
    afterGain.gain.setValueAtTime(afterGain.gain.value, now);
    afterGain.gain.linearRampToValueAtTime(afterTarget, now + GAIN_RAMP_S);
  }, [mode, beforeGainDb, afterGainDb]);

  // ---- Three.js scene setup + dual Web Audio graph (mount-only) ----
  useEffect(() => {
    const mountEl = mountRef.current;
    const beforeAudio = beforeAudioRef.current;
    const afterAudio = afterAudioRef.current;
    if (!mountEl || !beforeAudio || !afterAudio) return undefined;

    let renderer;
    let composer;
    let scene;
    let camera;
    let coreMesh;
    let wireMesh;
    let particles;
    let beforeGraph;
    let afterGraph;
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

      // Core: solid low-opacity icosphere, additive so it glows under bloom.
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: EMBER,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      coreMesh = new THREE.Mesh(baseGeometry, coreMaterial);
      scene.add(coreMesh);

      // Wireframe overlay — the part whose vertices actually get displaced
      // by frequency data each frame, so the "reactive" motion reads as a
      // structured pulse rather than mush.
      const wireGeometry = new THREE.IcosahedronGeometry(1.4, 4);
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: BRASS,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      });
      wireMesh = new THREE.Mesh(wireGeometry, wireMaterial);
      scene.add(wireMesh);

      // Sparse particle field behind the core — pulses with bass energy,
      // gives the scene depth without costing much (a single BufferGeometry
      // draw call).
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

      // ---- Two independent audio graphs, one per element — see this
      // file's doc comment for why: only this makes the switch instant. ----
      beforeGraph = setupAudioGraph(beforeAudio);
      afterGraph = setupAudioGraph(afterAudio);
      beforeGainNodeRef.current = beforeGraph.gainNode;
      afterGainNodeRef.current = afterGraph.gainNode;
      // Whichever is active per the current mode starts audible immediately
      // (no ramp-in on first mount) — the ramp is for switching later, not
      // for the initial reveal.
      beforeGraph.gainNode.gain.value = modeRef.current === "before" ? 10 ** (beforeGainDb / 20) : 0;
      afterGraph.gainNode.gain.value = modeRef.current === "after" ? 10 ** (afterGainDb / 20) : 0;

      resumeOnPlay = () => {
        if (beforeGraph.audioContext.state === "suspended") beforeGraph.audioContext.resume();
        if (afterGraph.audioContext.state === "suspended") afterGraph.audioContext.resume();
      };
      beforeAudio.addEventListener("play", resumeOnPlay);
      afterAudio.addEventListener("play", resumeOnPlay);

      // Analysed for the visualizer from whichever graph is currently
      // audible — reading both and taking whichever has real signal is
      // simpler and more robust than trying to track "which one is
      // active" independently here, and it's naturally correct mid-ramp
      // too (both contribute proportionally to their current gain).
      const beforeFreq = new Uint8Array(beforeGraph.analyser.frequencyBinCount);
      const afterFreq = new Uint8Array(afterGraph.analyser.frequencyBinCount);
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
        const playing = (!beforeAudio.paused && !beforeAudio.ended) || (!afterAudio.paused && !afterAudio.ended);
        if (playing) {
          beforeGraph.analyser.getByteFrequencyData(beforeFreq);
          afterGraph.analyser.getByteFrequencyData(afterFreq);
          const source = modeRef.current === "before" ? beforeFreq : afterFreq;
          bass = bandAvg(source, 0.0, 0.12);
          mid = bandAvg(source, 0.12, 0.4);
          treble = bandAvg(source, 0.4, 0.85);
        }

        // Idle breathing when paused/stopped so the scene never looks frozen.
        const idlePulse = playing ? 0 : (Math.sin(elapsed * 0.8) + 1) * 0.5 * 0.25;
        const bassLevel = playing ? bass : idlePulse;
        const midLevel = playing ? mid : idlePulse * 0.6;
        const trebleLevel = playing ? treble : idlePulse * 0.4;

        // Displace the wireframe's vertices radially per-vertex, weighted
        // by a low-frequency 3D noise-ish function of the vertex's own
        // base position so the pulse looks organic rather than uniformly
        // inflating like a balloon.
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
      // WebGL unavailable/blocked — fall back to the plain transport
      // (still rendered below, just without the canvas overlay).
      setWebglFailed(true);
    }

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) {
        beforeAudio.removeEventListener("play", resumeOnPlay);
        afterAudio.removeEventListener("play", resumeOnPlay);
      }
      teardownAudioGraph(beforeAudio, beforeGraph);
      teardownAudioGraph(afterAudio, afterGraph);
      beforeGainNodeRef.current = null;
      afterGainNodeRef.current = null;

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

  // ---- Transport — always drives both elements together, so whichever
  // one isn't currently audible keeps pace and is instantly ready the
  // moment mode flips. ----
  const togglePlay = () => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after) return;
    const bothPaused = before.paused && after.paused;
    if (bothPaused) {
      before.play().catch(() => {});
      after.play().catch(() => {});
    } else {
      before.pause();
      after.pause();
    }
  };

  const handleSeek = (event) => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after || !duration) return;
    const ratio = Number(event.target.value) / 1000;
    const t = ratio * duration;
    before.currentTime = t;
    after.currentTime = t;
    setCurrentTime(t);
  };

  // Time/duration/play-state are read off whichever element the current
  // mode is actually listening to — cosmetic during a ramp, but avoids
  // ever showing a number from the silent side. Both elements are kept in
  // lockstep by togglePlay/handleSeek above, with a light drift guard on
  // every tick in case independent decode timing nudges them apart.
  const handleTimeUpdate = (activeElementName) => (event) => {
    if (activeElementName !== modeRef.current) return;
    const t = event.currentTarget.currentTime || 0;
    setCurrentTime(t);
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after) return;
    const drift = Math.abs(before.currentTime - after.currentTime);
    if (drift > DRIFT_RESYNC_S) {
      const other = activeElementName === "before" ? after : before;
      other.currentTime = t;
    }
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
        ref={beforeAudioRef}
        src={beforeSrc}
        crossOrigin="anonymous"
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => modeRef.current === "before" && setIsPlaying(false)}
        onEnded={() => modeRef.current === "before" && setIsPlaying(false)}
        onLoadedMetadata={(e) => modeRef.current === "before" && setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={handleTimeUpdate("before")}
      />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={afterAudioRef}
        src={activeAfterSrc}
        crossOrigin="anonymous"
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => modeRef.current === "after" && setIsPlaying(false)}
        onEnded={() => modeRef.current === "after" && setIsPlaying(false)}
        onLoadedMetadata={(e) => modeRef.current === "after" && setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={handleTimeUpdate("after")}
        onError={handleAfterError}
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
