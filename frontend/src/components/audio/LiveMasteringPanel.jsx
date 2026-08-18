"use client";

import { useEffect, useRef, useState } from "react";

import { LiveMasteringEngine } from "@/components/audio/liveMasteringEngine";

const TWEAK_SLIDERS = [
  { key: "low_end", label: "Low End" },
  { key: "punch", label: "Punch" },
  { key: "presence", label: "Presence" },
  { key: "brightness", label: "Brightness" },
  { key: "warmth", label: "Warmth" },
  { key: "width", label: "Width" },
  { key: "loudness", label: "Loudness" },
];

const ADVANCED_DEFAULTS = {
  highpassHz: 30,
  compThresholdDb: -24,
  compRatio: 2.5,
  compAttackMs: 10,
  compReleaseMs: 150,
  limiterCeilingDb: -1.0,
};

const ADVANCED_SLIDERS = [
  { key: "highpassHz", label: "Highpass (Hz)", min: 20, max: 250, step: 1 },
  { key: "compThresholdDb", label: "Comp Threshold (dB)", min: -40, max: 0, step: 0.5 },
  { key: "compRatio", label: "Comp Ratio", min: 1, max: 10, step: 0.1 },
  { key: "compAttackMs", label: "Comp Attack (ms)", min: 1, max: 100, step: 1 },
  { key: "compReleaseMs", label: "Comp Release (ms)", min: 30, max: 500, step: 5 },
  { key: "limiterCeilingDb", label: "Limiter Ceiling (dBTP)", min: -6, max: 0, step: 0.1 },
];

// Maps the existing -1..1 "tweak" sliders onto the live Web Audio graph.
// Mirrors the intent of the backend's tweak mapping (not bit-exact — this is
// a fast preview chain, the backend render is the real master).
function tweaksToEngineParams(tweaks, advanced) {
  const t = tweaks || {};
  return {
    ...advanced,
    lowShelfDb: (t.low_end || 0) * 4,
    lowMidDb: (t.warmth || 0) * 2.5,
    presenceDb: (t.presence || 0) * 3,
    highShelfDb: (t.brightness || 0) * 3,
    saturationAmount: Math.max(0, (t.warmth || 0)) * 0.5,
    compRatio: advanced.compRatio + Math.max(0, t.punch || 0) * 2,
    compThresholdDb: advanced.compThresholdDb - Math.max(0, t.punch || 0) * 6,
    width: 1 + (t.width || 0) * 0.35,
    outputGainDb: (t.loudness || 0) * 4,
  };
}

function dbLabel(linearOrDb, isDb = false) {
  const db = isDb ? linearOrDb : 20 * Math.log10(Math.max(linearOrDb, 1e-6));
  if (!Number.isFinite(db) || db < -60) return "-inf";
  return db.toFixed(1);
}

export default function LiveMasteringPanel({ file, previewUrl, tweaks, onChangeTweak }) {
  const audioRef = useRef(null);
  const engineRef = useRef(null);
  const meterRef = useRef({ peak: 0, heldPeak: 0, rms: 0, correlation: 1 });
  const canvasRef = useRef(null);
  const spectrumRef = useRef(null);
  const [engineReady, setEngineReady] = useState(false);
  const [advanced, setAdvanced] = useState({ ...ADVANCED_DEFAULTS });
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!file || !audioRef.current) return undefined;
    const engine = new LiveMasteringEngine(audioRef.current);
    engineRef.current = engine;
    engine.onMeter = (data) => {
      meterRef.current = data;
    };
    engine.init().then((ok) => setEngineReady(ok));
    return () => {
      engine.destroy();
      engineRef.current = null;
      setEngineReady(false);
    };
  }, [file]);

  useEffect(() => {
    if (!engineReady) return;
    engineRef.current?.setParams(tweaksToEngineParams(tweaks, advanced));
  }, [engineReady, tweaks, advanced]);

  useEffect(() => {
    if (!engineReady) return undefined;
    let frameId = 0;
    const canvas = canvasRef.current;
    const spectrumCanvas = spectrumRef.current;
    const byteData = new Uint8Array(1024);

    const draw = () => {
      const m = meterRef.current;

      if (canvas) {
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const rowH = h / 3;
        const drawBar = (row, label, valueDb, minDb, maxDb, danger) => {
          const y = row * rowH;
          const frac = Math.max(0, Math.min(1, (valueDb - minDb) / (maxDb - minDb)));
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(0, y + 4, w, rowH - 10);
          ctx.fillStyle = danger && valueDb > danger ? "#ef4444" : "#e85d2a";
          ctx.fillRect(0, y + 4, w * frac, rowH - 10);
          ctx.fillStyle = "#e5e5e5";
          ctx.font = "10px monospace";
          ctx.fillText(`${label} ${valueDb.toFixed(1)}dB`, 4, y + rowH - 12);
        };

        drawBar(0, "Peak", dbLabel(m.heldPeak) === "-inf" ? -60 : 20 * Math.log10(Math.max(m.heldPeak, 1e-6)), -60, 0, -1.0);
        drawBar(1, "Level", 20 * Math.log10(Math.max(m.rms, 1e-6)), -60, 0, null);

        const corrY = rowH * 2;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, corrY + 4, w, rowH - 10);
        const corrFrac = (Math.max(-1, Math.min(1, m.correlation)) + 1) / 2;
        ctx.fillStyle = m.correlation < 0 ? "#ef4444" : "#dfc95a";
        ctx.fillRect(w / 2 - 1, corrY + 4, Math.max(2, Math.abs(corrFrac - 0.5) * w) * (corrFrac < 0.5 ? -1 : 1), rowH - 10);
        ctx.fillStyle = "#e5e5e5";
        ctx.fillText(`Phase Correlation ${m.correlation.toFixed(2)}`, 4, corrY + rowH - 12);
      }

      if (spectrumCanvas && engineRef.current) {
        engineRef.current.getSpectrum(byteData);
        const ctx = spectrumCanvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const w = spectrumCanvas.clientWidth;
        const h = spectrumCanvas.clientHeight;
        if (spectrumCanvas.width !== w * dpr) {
          spectrumCanvas.width = w * dpr;
          spectrumCanvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const bars = 64;
        const barW = w / bars;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * byteData.length * 0.7);
          const v = byteData[idx] / 255;
          ctx.fillStyle = "rgba(232, 93, 42, 0.85)";
          ctx.fillRect(i * barW, h - v * h, barW - 1, v * h);
        }
      }

      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [engineReady]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
          Live Preview {engineReady ? "" : "(loading engine...)"}
        </p>
        {/* key forces a brand-new DOM node per file — an HTMLMediaElement can
            only ever have createMediaElementSource() called on it once,
            permanently, even across engine instances/AudioContexts. Reusing
            the same element for a second file throws InvalidStateError. */}
        <audio key={previewUrl} ref={audioRef} src={previewUrl} controls className="w-full" />
        <p className="mt-2 text-[10px] text-zinc-500">
          Instant in-browser preview so you can hear changes immediately. The final download is still rendered by the
          real mastering engine — this preview approximates it, it isn&apos;t bit-identical.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-2">
        <canvas ref={canvasRef} className="h-28 w-full rounded-lg border border-white/10 bg-black/30" />
        <canvas ref={spectrumRef} className="h-28 w-full rounded-lg border border-white/10 bg-black/30" />
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-300">Mix Tweaks</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {TWEAK_SLIDERS.map((slider) => (
            <label key={slider.key} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs uppercase tracking-[0.12em]">
              <div className="mb-2 flex items-center justify-between gap-3 text-zinc-300">
                <span>{slider.label}</span>
                <span className="text-brass">{Number(tweaks[slider.key] || 0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={tweaks[slider.key] || 0}
                onChange={(event) => onChangeTweak(slider.key, event.target.value)}
                className="w-full"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs uppercase tracking-[0.14em] text-brass hover:text-ember"
        >
          {showAdvanced ? "Hide" : "Show"} Advanced Parameters (full mix console)
        </button>

        {showAdvanced ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-2">
            {ADVANCED_SLIDERS.map((slider) => (
              <label key={slider.key} className="text-xs uppercase tracking-[0.12em]">
                <div className="mb-2 flex items-center justify-between gap-3 text-zinc-300">
                  <span>{slider.label}</span>
                  <span className="text-brass">{advanced[slider.key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={advanced[slider.key]}
                  onChange={(event) =>
                    setAdvanced((prev) => ({ ...prev, [slider.key]: Number(event.target.value) }))
                  }
                  className="w-full"
                />
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
