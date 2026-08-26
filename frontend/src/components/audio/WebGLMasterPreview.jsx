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

/**
 * The "cooler" replacement for SignalVisualizer's flat canvas bars — a real
 * WebGL scene (three.js) whose geometry reacts to the actual frequency
 * content of whatever's playing, plus fully custom Tailwind transport
 * controls instead of the native <audio controls> UI. Built for the
 * dedicated post-mastering results page.
 *
 * Audio graph mirrors SignalVisualizer.jsx's proven pattern
 * (AudioContext -> createMediaElementSource -> AnalyserNode -> destination,
 * gain node for A/B loudness matching) — same caveats apply: the mount-only
 * effect exists because createMediaElementSource can only ever be called
 * once per <audio> element, across the element's whole lifetime.
 */
export default function WebGLMasterPreview({ src, gainDb = 0, className = "" }) {
  const mountRef = useRef(null);
  const audioRef = useRef(null);
  const gainNodeRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);

  // Live-updated without touching the audio graph, same reasoning as
  // SignalVisualizer — gainDb typically resolves after mount once
  // ab_gain_match arrives.
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 10 ** (gainDb / 20);
    }
  }, [gainDb]);

  // ---- Three.js scene setup + Web Audio analysis (mount-only) ----
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
    let analyser;
    let audioContext;
    let gainNode;
    let sourceNode;
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

      // ---- Web Audio graph — same shape as SignalVisualizer.jsx ----
      graph = audioGraphs.get(audio);
      if (graph) {
        // Reused from a same-tick StrictMode remount — cancel its
        // pending deferred close and reuse the existing nodes instead of
        // calling createMediaElementSource again (which would throw).
        if (graph.closeTimer) {
          clearTimeout(graph.closeTimer);
          graph.closeTimer = null;
        }
        ({ audioContext, analyser, gainNode, sourceNode } = graph);
      } else {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;

        gainNode = audioContext.createGain();
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);

        graph = { audioContext, analyser, gainNode, sourceNode, closeTimer: null };
        audioGraphs.set(audio, graph);
      }
      gainNode.gain.value = 10 ** (gainDb / 20);
      gainNodeRef.current = gainNode;

      resumeOnPlay = () => {
        if (audioContext.state === "suspended") audioContext.resume();
      };
      audio.addEventListener("play", resumeOnPlay);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const bandAvg = (fromFrac, toFrac) => {
        const from = Math.floor(freqData.length * fromFrac);
        const to = Math.max(from + 1, Math.floor(freqData.length * toFrac));
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += freqData[i];
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
          analyser.getByteFrequencyData(freqData);
          bass = bandAvg(0.0, 0.12);
          mid = bandAvg(0.12, 0.4);
          treble = bandAvg(0.4, 0.85);
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
      // WebGL unavailable/blocked — fall back to the plain <audio> element
      // (still rendered below, just without the canvas overlay).
      setWebglFailed(true);
    }

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (resumeOnPlay) audio.removeEventListener("play", resumeOnPlay);
      if (graph) {
        // Deferred: a StrictMode phantom remount within this same tick
        // will find this pending timer and cancel it (see setup above),
        // reusing the graph instead of losing it. A real unmount lets
        // this fire on the next tick and actually release the nodes.
        graph.closeTimer = setTimeout(() => {
          sourceNode.disconnect();
          analyser.disconnect();
          gainNode.disconnect();
          if (audioContext.state !== "closed") audioContext.close();
          audioGraphs.delete(audio);
        }, 0);
      }
      gainNodeRef.current = null;

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

  // ---- Transport ----
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
    audio.currentTime = ratio * duration;
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
        src={src}
        crossOrigin="anonymous"
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
      />

      {/* Fully custom Tailwind transport — no native <audio controls>. */}
      <div className="flex items-center gap-3 border-t border-white/10 bg-black/30 px-4 py-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brass/40 bg-gradient-to-br from-ember to-brass text-black shadow-[0_0_16px_rgba(232,93,42,0.35)] transition hover:brightness-110"
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

        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">{formatTime(currentTime)}</span>

        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progressRatio * 1000)}
          onChange={handleSeek}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-ember"
          style={{
            background: `linear-gradient(to right, var(--ember) ${progressRatio * 100}%, rgba(255,255,255,0.12) ${progressRatio * 100}%)`,
          }}
          aria-label="Seek"
        />

        <span className="w-9 shrink-0 text-[10px] tabular-nums text-zinc-400">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
