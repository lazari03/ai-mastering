"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Auralith's one reusable Three.js visual system (spec: "AURALITH AUDIO
// FIELD") — an abstract waveform field, not a literal audio player.
// Deliberately raw `three`, matching the only other Three.js usage in this
// codebase (WebGLMasterPreview.jsx's postprocessed AudioContext-reactive
// preview) rather than adding @react-three/fiber/@react-three/drei as new
// dependencies for a single component.
//
// Unlike Threads.jsx (a purely decorative ogl shader that hard-freezes
// after 1.2s specifically to stay out of Lighthouse's trace window), this
// is core hero content per the design spec, so it keeps animating for as
// long as it's actually visible — cost is controlled by an fps cap plus
// pausing entirely off-screen/hidden, not by freezing outright.
const LINE_COUNT = 140;
const POINTS_PER_LINE = 64;
const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const MAX_RENDER_DIM = 1920;

const COPPER = new THREE.Color(0xb96a43);
const EMBER = new THREE.Color(0xe66a32);

/**
 * mode: "hero" | "ambient" — both render the same geometry today;
 * `mode` is threaded through so call sites (hero background vs. a
 * lighter ambient section backdrop) can diverge later (fewer lines,
 * slower drift) without changing the component's contract.
 */
export default function ThreeAudioField({ mode = "hero", audioLevel = null, className = "" }) {
  const containerRef = useRef(null);
  const audioLevelRef = useRef(0);

  useEffect(() => {
    audioLevelRef.current = typeof audioLevel === "number" ? audioLevel : 0;
  }, [audioLevel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      // No WebGL — the section's own gradient background stands alone.
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, mode === "ambient" ? 14 : 11);

    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // A field of gently curved lines running left-to-right, stacked in
    // depth — the "hundreds of fine lines forming a flowing waveform"
    // from the spec, without literal per-sample audio data (this is the
    // ambient/hero mode; a future "processing"/"result" mode can drive
    // vertex offsets from a real analyser instead of the noise below).
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(LINE_COUNT * POINTS_PER_LINE * 3);
    const colors = new Float32Array(LINE_COUNT * POINTS_PER_LINE * 3);
    const seeds = new Float32Array(LINE_COUNT);
    for (let i = 0; i < LINE_COUNT; i++) seeds[i] = Math.random() * 1000;

    const color = new THREE.Color();
    for (let i = 0; i < LINE_COUNT; i++) {
      const depth = i / LINE_COUNT;
      color.copy(COPPER).lerp(EMBER, depth);
      for (let j = 0; j < POINTS_PER_LINE; j++) {
        const idx = (i * POINTS_PER_LINE + j) * 3;
        colors[idx] = color.r;
        colors[idx + 1] = color.g;
        colors[idx + 2] = color.b;
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mode === "ambient" ? 0.35 : 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lines = [];
    for (let i = 0; i < LINE_COUNT; i++) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions.subarray(i * POINTS_PER_LINE * 3, (i + 1) * POINTS_PER_LINE * 3), 3));
      lineGeometry.setAttribute("color", new THREE.BufferAttribute(colors.subarray(i * POINTS_PER_LINE * 3, (i + 1) * POINTS_PER_LINE * 3), 3));
      const line = new THREE.Line(lineGeometry, material);
      scene.add(line);
      lines.push(line);
    }

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let scrollFactor = 0;

    function handlePointerMove(event) {
      const rect = container.getBoundingClientRect();
      pointer.targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    }
    function handlePointerLeave() {
      pointer.targetX = 0;
      pointer.targetY = 0;
    }
    function handleScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollFactor = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    }
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    function resize() {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
      const longestSide = Math.max(clientWidth, clientHeight) * baseDpr;
      const dpr = longestSide > MAX_RENDER_DIM ? (baseDpr * MAX_RENDER_DIM) / longestSide : baseDpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let isVisible = true;
    const intersectionObserver = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    }, { threshold: 0 });
    intersectionObserver.observe(container);

    let rafId = 0;
    let lastFrame = 0;

    function animate(timestamp) {
      rafId = requestAnimationFrame(animate);
      if (!isVisible || document.hidden) return;
      if (timestamp - lastFrame < FRAME_INTERVAL_MS) return;
      lastFrame = timestamp;

      pointer.x += (pointer.targetX - pointer.x) * 0.04;
      pointer.y += (pointer.targetY - pointer.y) * 0.04;

      const t = timestamp * 0.00035;
      const energy = 1 + audioLevelRef.current * 0.9;

      for (let i = 0; i < LINE_COUNT; i++) {
        const line = lines[i];
        const attr = line.geometry.getAttribute("position");
        const depth = i / LINE_COUNT;
        const z = -depth * 6 + 3;
        for (let j = 0; j < POINTS_PER_LINE; j++) {
          const u = j / (POINTS_PER_LINE - 1);
          const x = (u - 0.5) * 14;
          const wave =
            Math.sin(u * 6 + t * 4 + seeds[i]) * 0.35 +
            Math.sin(u * 2.3 - t * 2.2 + seeds[i] * 0.7) * 0.5 +
            pointer.y * 0.8 * (1 - Math.abs(u - 0.5) * 1.2);
          const y = wave * energy * (0.6 + depth * 0.5) + (depth - 0.5) * 0.6;
          attr.setXYZ(j, x + pointer.x * 0.6 * depth, y, z);
        }
        attr.needsUpdate = true;
      }

      camera.position.x = pointer.x * 0.6;
      camera.position.y = -scrollFactor * 1.5;
      camera.lookAt(0, -scrollFactor * 1.5, 0);

      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      for (const line of lines) line.geometry.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [mode]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} aria-hidden="true" />;
}
