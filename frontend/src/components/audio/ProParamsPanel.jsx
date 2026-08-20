"use client";

import Knob from "@/components/ui/Knob";

// Manual controls for Pro Mastering — every field here maps directly to a
// key backend/app/services/preset_dsp_engine.py actually reads out of a
// preset's "processing" block (see that file's per-stage functions). No
// control exists here that the engine doesn't process. Knobs instead of
// bare number fields on purpose — a strip of knobs reads as "one console
// section" at a glance the way a row of <input type=number> never does,
// and dragging to a rough position first, then fine-tuning the readout, is
// how this kind of control actually gets used.

const ICON_BASE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

// One small hand-drawn glyph per processing stage — same style as the app
// shell's tab icons (components/app/icons.jsx) — so each section is
// identifiable by shape, not just a text label, at a glance.
const SECTION_ICONS = {
  input: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M4 12h4M16 12h4M8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" />
    </svg>
  ),
  eq: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M3 17c2-1 3-9 5-9s2 7 4 7 2-11 4-11 2 9 5 9" />
    </svg>
  ),
  dynamics: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M3 8h18" strokeDasharray="2 2.5" />
      <path d="M4 16c2 0 2-9 4-9s2 6 4 6 2-6 4-6 2 9 4 9" />
    </svg>
  ),
  multiband: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M5 18V10M11 18V5M17 18v13.5M17 18V13" />
      <path d="M5 18h14" />
    </svg>
  ),
  saturation: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M3 12c1.5-5 2.5-5 3 0s1.5 5 3 0 1.5-5 3 0 1.5 5 3 0 1.5-5 3 0" />
    </svg>
  ),
  stereo: (p) => (
    <svg {...ICON_BASE} {...p}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  ),
  limiter: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M3 5h18" strokeDasharray="2 2.5" />
      <path d="M4 18 9 7l3 5 2-3 6 9" />
    </svg>
  ),
  output: (p) => (
    <svg {...ICON_BASE} {...p}>
      <path d="M13 4v10M13 14l-3.5-3.5M13 14l3.5-3.5" />
      <path d="M5 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
};

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-zinc-200">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function Section({ icon, title, subtitle, wide, children }) {
  const Icon = SECTION_ICONS[icon];
  return (
    <div className={`rounded-lg border border-white/10 bg-black/20 p-2 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <div className="flex items-center gap-1.5" title={subtitle}>
        {Icon ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-brass/30 bg-brass/[0.08] text-brass">
            <Icon width={12} height={12} />
          </span>
        ) : null}
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.1em] text-brass">{title}</p>
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

// A row of knobs, like one strip on a hardware channel — the visual unit
// that makes "these controls belong together" obvious without a label.
function KnobRow({ children }) {
  return <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">{children}</div>;
}

function BandRow({ band, onChange, onRemove, knobs }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-white/10 bg-black/25 p-1.5">
      {knobs.map(([key, label, min, max, step, unit]) => (
        <Knob key={key} label={label} unit={unit} size={32} value={band[key] ?? 0} min={min} max={max} step={step} onChange={(v) => onChange({ [key]: v })} />
      ))}
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto h-6 w-6 shrink-0 self-center rounded-md border border-red-400/30 bg-red-500/10 text-[11px] text-red-300 hover:border-red-400/50"
      >
        ✕
      </button>
    </div>
  );
}

export default function ProParamsPanel({ proParams, setSection, addBand, updateBand, removeBand, addStereoBand, updateStereoBand, removeStereoBand, onReset }) {
  const { input, highpass, eq, bus_compressor: bus, dynamic_eq: dynEq, saturation, stereo, clipper, limiter, output } = proParams;

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[10px] text-zinc-500">Drag a knob up/down, or focus it and use arrow keys.</p>
        <button type="button" onClick={onReset} className="shrink-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30">
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Section icon="input" title="Input" subtitle="Gain staging before anything else runs">
          <Toggle checked={input.auto_gain} onChange={(v) => setSection("input", { auto_gain: v })} label="Auto input gain" />
          <KnobRow>
            <Knob label="Headroom" unit="dB" value={input.headroom_target_db} min={-24} max={0} step={0.5} onChange={(v) => setSection("input", { headroom_target_db: v })} />
          </KnobRow>
        </Section>

        <Section icon="dynamics" title="Dynamics" subtitle="Bus compressor — glues the mix together">
          <KnobRow>
            <Knob label="Ratio" unit=":1" value={bus.ratio} min={1} max={10} step={0.1} onChange={(v) => setSection("bus_compressor", { ratio: v })} />
            <Knob label="Max cut" unit="dB" value={bus.max_gain_reduction_db} min={0} max={12} step={0.5} onChange={(v) => setSection("bus_compressor", { max_gain_reduction_db: v })} />
            <Knob label="Attack" unit="ms" value={bus.attack_ms} min={0.1} max={200} step={0.5} onChange={(v) => setSection("bus_compressor", { attack_ms: v })} />
            <Knob label="Release" unit="ms" value={bus.release_ms} min={10} max={1000} step={5} onChange={(v) => setSection("bus_compressor", { release_ms: v })} />
          </KnobRow>
        </Section>

        <Section icon="saturation" title="Saturation" subtitle="Oversampled harmonic saturation / exciter">
          <Toggle checked={saturation.enabled} onChange={(v) => setSection("saturation", { enabled: v })} label="Saturation" />
          {saturation.enabled ? (
            <KnobRow>
              <Knob label="Amount" value={saturation.amount} min={0} max={0.15} step={0.005} onChange={(v) => setSection("saturation", { amount: v })} />
              <Knob label="Oversamp" unit="x" value={saturation.oversampling} min={1} max={8} step={1} onChange={(v) => setSection("saturation", { oversampling: v })} />
            </KnobRow>
          ) : null}
        </Section>

        <Section icon="stereo" title="Stereo / M-S" subtitle="Mono-below-frequency lock + per-band width">
          <KnobRow>
            <Knob
              label="Mono below"
              unit="Hz"
              value={stereo.low_end_mono_below_hz || 0}
              min={0}
              max={500}
              step={5}
              onChange={(v) => setSection("stereo", { low_end_mono_below_hz: v || null })}
            />
          </KnobRow>
        </Section>

        <Section icon="limiter" title="Limiter" subtitle="Loudness target and true-peak ceiling — final stage">
          <KnobRow>
            <Knob label="Loudness" unit="LUFS" value={limiter.target_lufs_i} min={-24} max={-6} step={0.5} onChange={(v) => setSection("limiter", { target_lufs_i: v })} />
            <Knob label="Ceiling" unit="dBTP" value={limiter.ceiling_dbtp} min={-3} max={0} step={0.1} onChange={(v) => setSection("limiter", { ceiling_dbtp: v })} />
          </KnobRow>
          <Toggle checked={clipper.enabled} onChange={(v) => setSection("clipper", { enabled: v })} label="Soft clipper (pre-limiter)" />
          {clipper.enabled ? (
            <KnobRow>
              <Knob label="Ceiling" unit="dBTP" value={clipper.ceiling_dbtp} min={-3} max={0} step={0.1} onChange={(v) => setSection("clipper", { ceiling_dbtp: v })} />
              <Knob label="Drive" unit="dB" value={clipper.drive_db} min={0} max={12} step={0.5} onChange={(v) => setSection("clipper", { drive_db: v })} />
              <Knob label="Oversamp" unit="x" value={clipper.oversampling} min={1} max={8} step={1} onChange={(v) => setSection("clipper", { oversampling: v })} />
            </KnobRow>
          ) : null}
        </Section>

        <Section icon="output" title="Output" subtitle="Bit depth and dither for the final file">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-zinc-400">Bit depth</span>
              <select
                value={output.bit_depth}
                onChange={(e) => setSection("output", { bit_depth: Number(e.target.value) })}
                className="w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-[12px] text-white"
              >
                <option value={16}>16-bit</option>
                <option value={24}>24-bit</option>
              </select>
            </label>
            <Toggle checked={output.dither === "triangular"} onChange={(v) => setSection("output", { dither: v ? "triangular" : "" })} label="Dither" />
          </div>
        </Section>

        <Section icon="eq" title="EQ" subtitle="High-pass filter + parametric bands" wide>
          <Toggle checked={highpass.enabled} onChange={(v) => setSection("highpass", { enabled: v })} label="High-pass filter" />
          {highpass.enabled ? (
            <KnobRow>
              <Knob label="Frequency" unit="Hz" value={highpass.frequency_hz} min={20} max={500} step={1} onChange={(v) => setSection("highpass", { frequency_hz: v })} />
              <Knob label="Slope" unit="dB/oct" value={highpass.slope_db_oct} min={12} max={48} step={12} onChange={(v) => setSection("highpass", { slope_db_oct: v })} />
            </KnobRow>
          ) : null}

          <div className="flex flex-col gap-1.5">
            {eq.map((band, i) => (
              <BandRow
                key={i}
                band={band}
                onChange={(patch) => updateBand("eq", i, patch)}
                onRemove={() => removeBand("eq", i)}
                knobs={[
                  ["frequency_hz", "Freq", 20, 20000, 10, "Hz"],
                  ["gain_db", "Gain", -18, 18, 0.5, "dB"],
                  ["q", "Q", 0.1, 10, 0.1],
                ]}
              />
            ))}
            <button
              type="button"
              onClick={() => addBand("eq", { frequency_hz: 1000, gain_db: 0, q: 1.0 })}
              className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
            >
              + Add EQ band
            </button>
          </div>
        </Section>

        <Section icon="multiband" title="Multiband" subtitle="Dynamic EQ — per-band compression on that band's loudest moments" wide>
          <div className="flex flex-col gap-1.5">
            {dynEq.map((band, i) => (
              <BandRow
                key={i}
                band={band}
                onChange={(patch) => updateBand("dynamic_eq", i, patch)}
                onRemove={() => removeBand("dynamic_eq", i)}
                knobs={[
                  ["frequency_hz", "Freq", 20, 20000, 10, "Hz"],
                  ["q", "Q", 0.1, 10, 0.1],
                  ["max_gain_reduction_db", "Max cut", 0, 18, 0.5, "dB"],
                  ["release_ms", "Release", 10, 1000, 5, "ms"],
                ]}
              />
            ))}
            <button
              type="button"
              onClick={() => addBand("dynamic_eq", { frequency_hz: 3000, q: 1.5, max_gain_reduction_db: 2, release_ms: 100 })}
              className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
            >
              + Add multiband
            </button>
          </div>
        </Section>

        <Section icon="stereo" title="Stereo Width Bands" subtitle="Per-frequency-range mid/side width" wide>
          <div className="flex flex-col gap-1.5">
            {stereo.bands.map((band, i) => (
              <BandRow
                key={i}
                band={band}
                onChange={(patch) => updateStereoBand(i, patch)}
                onRemove={() => removeStereoBand(i)}
                knobs={[
                  ["from_hz", "From", 20, 20000, 10, "Hz"],
                  ["to_hz", "To", 20, 20000, 10, "Hz"],
                  ["gain", "Width", -1, 2, 0.05],
                ]}
              />
            ))}
            <button
              type="button"
              onClick={() => addStereoBand({ from_hz: 2000, to_hz: 12000, gain: 0.2 })}
              className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
            >
              + Add width band
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
