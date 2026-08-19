"use client";

// Manual controls for Pro Mastering — every field here maps directly to a
// key backend/app/services/preset_dsp_engine.py actually reads out of a
// preset's "processing" block (see that file's per-stage functions). No
// control exists here that the engine doesn't process.

function Field({ label, unit, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-zinc-400">
        <span>{label}</span>
        {unit ? <span className="text-zinc-600">{unit}</span> : null}
      </span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      className="w-full rounded-lg border border-white/15 bg-black/25 px-2.5 py-2 text-[13px] text-white"
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{title}</p>
      {subtitle ? <p className="m-0 mt-0.5 text-[10px] text-zinc-500">{subtitle}</p> : null}
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function BandRow({ band, onChange, onRemove, fields }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(70px,1fr))_auto] items-end gap-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
      {fields.map(([key, label, min, max, step]) => (
        <Field key={key} label={label}>
          <NumberInput value={band[key] ?? 0} onChange={(v) => onChange({ [key]: v })} min={min} max={max} step={step} />
        </Field>
      ))}
      <button
        type="button"
        onClick={onRemove}
        className="h-9 shrink-0 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 text-xs text-red-300 hover:border-red-400/50"
      >
        ✕
      </button>
    </div>
  );
}

export default function ProParamsPanel({ proParams, setSection, addBand, updateBand, removeBand, addStereoBand, updateStereoBand, removeStereoBand, onReset }) {
  const { input, highpass, eq, bus_compressor: bus, dynamic_eq: dynEq, saturation, stereo, clipper, limiter, output } = proParams;

  return (
    <div className="mt-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <p className="m-0 text-xs text-zinc-400">Every control here is rendered by the real mastering engine — nothing is decorative.</p>
        <button type="button" onClick={onReset} className="shrink-0 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30">
          Reset to defaults
        </button>
      </div>

      <Section title="Input" subtitle="Gain staging before anything else runs">
        <Toggle checked={input.auto_gain} onChange={(v) => setSection("input", { auto_gain: v })} label="Auto input gain" />
        <Field label="Headroom target" unit="dB">
          <NumberInput value={input.headroom_target_db} min={-24} max={0} step={0.5} onChange={(v) => setSection("input", { headroom_target_db: v })} />
        </Field>
      </Section>

      <Section title="EQ" subtitle="High-pass filter + parametric bands">
        <Toggle checked={highpass.enabled} onChange={(v) => setSection("highpass", { enabled: v })} label="High-pass filter" />
        {highpass.enabled ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Frequency" unit="Hz">
              <NumberInput value={highpass.frequency_hz} min={20} max={500} step={1} onChange={(v) => setSection("highpass", { frequency_hz: v })} />
            </Field>
            <Field label="Slope" unit="dB/oct">
              <NumberInput value={highpass.slope_db_oct} min={12} max={48} step={12} onChange={(v) => setSection("highpass", { slope_db_oct: v })} />
            </Field>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {eq.map((band, i) => (
            <BandRow
              key={i}
              band={band}
              onChange={(patch) => updateBand("eq", i, patch)}
              onRemove={() => removeBand("eq", i)}
              fields={[
                ["frequency_hz", "Freq (Hz)", 20, 20000, 10],
                ["gain_db", "Gain (dB)", -18, 18, 0.5],
                ["q", "Q", 0.1, 10, 0.1],
              ]}
            />
          ))}
          <button
            type="button"
            onClick={() => addBand("eq", { frequency_hz: 1000, gain_db: 0, q: 1.0 })}
            className="rounded-lg border border-dashed border-white/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
          >
            + Add EQ band
          </button>
        </div>
      </Section>

      <Section title="Dynamics" subtitle="Bus compressor — glues the whole mix together">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Ratio" unit=":1">
            <NumberInput value={bus.ratio} min={1} max={10} step={0.1} onChange={(v) => setSection("bus_compressor", { ratio: v })} />
          </Field>
          <Field label="Max reduction" unit="dB">
            <NumberInput value={bus.max_gain_reduction_db} min={0} max={12} step={0.5} onChange={(v) => setSection("bus_compressor", { max_gain_reduction_db: v })} />
          </Field>
          <Field label="Attack" unit="ms">
            <NumberInput value={bus.attack_ms} min={0.1} max={200} step={0.5} onChange={(v) => setSection("bus_compressor", { attack_ms: v })} />
          </Field>
          <Field label="Release" unit="ms">
            <NumberInput value={bus.release_ms} min={10} max={1000} step={5} onChange={(v) => setSection("bus_compressor", { release_ms: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Multiband" subtitle="Dynamic EQ — per-band compression, engages only on that band's loudest moments">
        <div className="flex flex-col gap-2">
          {dynEq.map((band, i) => (
            <BandRow
              key={i}
              band={band}
              onChange={(patch) => updateBand("dynamic_eq", i, patch)}
              onRemove={() => removeBand("dynamic_eq", i)}
              fields={[
                ["frequency_hz", "Freq (Hz)", 20, 20000, 10],
                ["q", "Q", 0.1, 10, 0.1],
                ["max_gain_reduction_db", "Max cut (dB)", 0, 18, 0.5],
                ["release_ms", "Release (ms)", 10, 1000, 5],
              ]}
            />
          ))}
          <button
            type="button"
            onClick={() => addBand("dynamic_eq", { frequency_hz: 3000, q: 1.5, max_gain_reduction_db: 2, release_ms: 100 })}
            className="rounded-lg border border-dashed border-white/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
          >
            + Add multiband
          </button>
        </div>
      </Section>

      <Section title="Saturation / Exciter" subtitle="Oversampled harmonic saturation">
        <Toggle checked={saturation.enabled} onChange={(v) => setSection("saturation", { enabled: v })} label="Saturation" />
        {saturation.enabled ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Amount">
              <NumberInput value={saturation.amount} min={0} max={0.15} step={0.005} onChange={(v) => setSection("saturation", { amount: v })} />
            </Field>
            <Field label="Oversampling" unit="x">
              <NumberInput value={saturation.oversampling} min={1} max={8} step={1} onChange={(v) => setSection("saturation", { oversampling: v })} />
            </Field>
          </div>
        ) : null}
      </Section>

      <Section title="Stereo / M-S" subtitle="Mono-below-frequency lock + per-band mid/side width">
        <Field label="Mono below" unit="Hz">
          <NumberInput value={stereo.low_end_mono_below_hz || 0} min={0} max={500} step={5} onChange={(v) => setSection("stereo", { low_end_mono_below_hz: v || null })} />
        </Field>
        <div className="flex flex-col gap-2">
          {stereo.bands.map((band, i) => (
            <BandRow
              key={i}
              band={band}
              onChange={(patch) => updateStereoBand(i, patch)}
              onRemove={() => removeStereoBand(i)}
              fields={[
                ["from_hz", "From (Hz)", 20, 20000, 10],
                ["to_hz", "To (Hz)", 20, 20000, 10],
                ["gain", "Width (± 1.0)", -1, 2, 0.05],
              ]}
            />
          ))}
          <button
            type="button"
            onClick={() => addStereoBand({ from_hz: 2000, to_hz: 12000, gain: 0.2 })}
            className="rounded-lg border border-dashed border-white/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/40"
          >
            + Add width band
          </button>
        </div>
      </Section>

      <Section title="Limiter" subtitle="Loudness target and true-peak ceiling — the final stage">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Loudness target" unit="LUFS-I">
            <NumberInput value={limiter.target_lufs_i} min={-24} max={-6} step={0.5} onChange={(v) => setSection("limiter", { target_lufs_i: v })} />
          </Field>
          <Field label="True-peak ceiling" unit="dBTP">
            <NumberInput value={limiter.ceiling_dbtp} min={-3} max={0} step={0.1} onChange={(v) => setSection("limiter", { ceiling_dbtp: v })} />
          </Field>
        </div>
        <Toggle checked={clipper.enabled} onChange={(v) => setSection("clipper", { enabled: v })} label="Soft clipper (ahead of limiter)" />
        {clipper.enabled ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Ceiling" unit="dBTP">
              <NumberInput value={clipper.ceiling_dbtp} min={-3} max={0} step={0.1} onChange={(v) => setSection("clipper", { ceiling_dbtp: v })} />
            </Field>
            <Field label="Drive" unit="dB">
              <NumberInput value={clipper.drive_db} min={0} max={12} step={0.5} onChange={(v) => setSection("clipper", { drive_db: v })} />
            </Field>
          </div>
        ) : null}
      </Section>

      <Section title="Output" subtitle="Bit depth and dither for the final file">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Bit depth">
            <select
              value={output.bit_depth}
              onChange={(e) => setSection("output", { bit_depth: Number(e.target.value) })}
              className="w-full rounded-lg border border-white/15 bg-black/25 px-2.5 py-2 text-[13px] text-white"
            >
              <option value={16}>16-bit</option>
              <option value={24}>24-bit</option>
            </select>
          </Field>
          <Toggle
            checked={output.dither === "triangular"}
            onChange={(v) => setSection("output", { dither: v ? "triangular" : "" })}
            label="Dither (16-bit only)"
          />
        </div>
      </Section>
    </div>
  );
}
