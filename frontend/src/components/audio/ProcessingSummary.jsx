"use client";

// Real before/after DSP values pulled straight from the mastering engine's
// analysis (pyloudnorm/librosa/numpy — never an ffmpeg filter string, that
// field only exists on the disabled ffmpeg fallback engine and is never
// read here on purpose).

const BAND_LABELS = {
  sub_bass_20_60hz: "Sub Bass (20-60Hz)",
  bass_60_250hz: "Bass (60-250Hz)",
  low_mid_250_500hz: "Low Mid (250-500Hz)",
  mid_500_2000hz: "Mid (500-2000Hz)",
  high_mid_2000_4000hz: "High Mid (2-4kHz)",
  presence_4000_6000hz: "Presence (4-6kHz)",
  brilliance_6000_20000hz: "Brilliance (6-20kHz)",
};

const TRACK_METRICS = [
  { key: "integrated_lufs", label: "Integrated Loudness", unit: "LUFS", digits: 2 },
  { key: "true_peak_db", label: "True Peak", unit: "dBTP", digits: 2 },
  { key: "dynamic_range_db", label: "Dynamic Range (Crest Factor)", unit: "dB", digits: 2 },
  { key: "loudness_range_lu", label: "Loudness Range", unit: "LU", digits: 2 },
  { key: "stereo_width_estimate", label: "Stereo Width", unit: "", digits: 3 },
  { key: "stereo_correlation", label: "Phase Correlation", unit: "", digits: 3 },
];

function fmt(value, digits) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function DeltaRow({ label, before, after, unit, digits }) {
  const delta = before != null && after != null ? after - before : null;
  const deltaLabel = delta == null ? "" : `${delta >= 0 ? "+" : ""}${delta.toFixed(digits)}`;
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-1.5 pr-3 text-zinc-300">{label}</td>
      <td className="py-1.5 pr-3 text-right text-zinc-400">{fmt(before, digits)}{unit}</td>
      <td className="py-1.5 pr-3 text-right text-zinc-100">{fmt(after, digits)}{unit}</td>
      <td className={`py-1.5 text-right ${delta > 0 ? "text-brass" : delta < 0 ? "text-ember" : "text-zinc-500"}`}>
        {deltaLabel}
      </td>
    </tr>
  );
}

function Table({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              <th className="pb-1.5 text-left font-medium">Parameter</th>
              <th className="pb-1.5 text-right font-medium">Before</th>
              <th className="pb-1.5 text-right font-medium">After</th>
              <th className="pb-1.5 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProcessingSummary({ result }) {
  if (!result) return null;

  const before = result.analysis_before || {};
  const after = result.analysis_after || {};
  const applied = result.processing_applied || {};

  const trackRows = TRACK_METRICS.filter((m) => before[m.key] != null || after[m.key] != null).map((m) => (
    <DeltaRow key={m.key} label={m.label} before={before[m.key]} after={after[m.key]} unit={m.unit ? ` ${m.unit}` : ""} digits={m.digits} />
  ));

  const beforeBands = before.spectral_balance || {};
  const afterBands = after.spectral_balance || {};
  const bandRows = Object.keys(BAND_LABELS)
    .filter((key) => beforeBands[key] != null || afterBands[key] != null)
    .map((key) => (
      <DeltaRow
        key={key}
        label={BAND_LABELS[key]}
        before={beforeBands[key] != null ? beforeBands[key] * 100 : null}
        after={afterBands[key] != null ? afterBands[key] * 100 : null}
        unit="%"
        digits={1}
      />
    ));

  // per_band_gain_changes_db is keyed by the spectral-analysis bands
  // (sub_bass_20_60hz, ...); compression_per_band is keyed by the DSP's
  // processing bands (low/low_mid/high_mid/high, or sub/punch/... on
  // professional tier). They're two different taxonomies — the low
  // processing band's gain is a blend of two analysis bands, not a 1:1 key
  // match — so they're shown as separate tables rather than guessed-merged.
  const eqGains = applied.per_band_gain_changes_db || null;
  const compPerBand = applied.compression_per_band || null;

  const eqRows =
    eqGains &&
    Object.keys(eqGains).map((bandKey) => (
      <tr key={bandKey} className="border-b border-white/5 text-xs last:border-0">
        <td className="py-1.5 pr-3 text-zinc-300">{BAND_LABELS[bandKey] || bandKey}</td>
        <td className="py-1.5 text-right text-zinc-100">
          {eqGains[bandKey] >= 0 ? "+" : ""}
          {eqGains[bandKey].toFixed(2)} dB
        </td>
      </tr>
    ));

  const compRows =
    compPerBand &&
    Object.keys(compPerBand).map((bandName) => (
      <tr key={bandName} className="border-b border-white/5 text-xs last:border-0">
        <td className="py-1.5 pr-3 capitalize text-zinc-300">{bandName.replace("_", " ")}</td>
        <td className="py-1.5 pr-3 text-right text-zinc-100">{compPerBand[bandName].ratio.toFixed(2)}:1</td>
        <td className="py-1.5 text-right text-zinc-100">{compPerBand[bandName].threshold_db.toFixed(1)} dB</td>
      </tr>
    ));

  const limiter = applied.limiter;

  return (
    <div className="space-y-3 text-xs text-zinc-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/15 px-2.5 py-1 uppercase tracking-[0.1em] text-zinc-200">
          Engine: {applied.engine === "preset_dsp_engine" ? "Preset DSP" : "Adaptive DSP"}
        </span>
        {applied.tier ? (
          <span className="rounded-full border border-brass/40 bg-brass/10 px-2.5 py-1 uppercase tracking-[0.1em] text-brass">
            Tier: {applied.tier}
          </span>
        ) : null}
        {applied.stages ? (
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-zinc-400">
            Stages: {applied.stages.join(", ")}
          </span>
        ) : null}
      </div>

      <Table title="Track Analysis" rows={trackRows} />
      <Table title="Frequency Balance (share of total energy)" rows={bandRows} />

      {eqRows && eqRows.length ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">EQ Gain Applied (by frequency band)</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <th className="pb-1.5 text-left font-medium">Band</th>
                  <th className="pb-1.5 text-right font-medium">Gain Change</th>
                </tr>
              </thead>
              <tbody>{eqRows}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {compRows && compRows.length ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Compression Per Band</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <th className="pb-1.5 text-left font-medium">Band</th>
                  <th className="pb-1.5 text-right font-medium">Ratio</th>
                  <th className="pb-1.5 text-right font-medium">Threshold</th>
                </tr>
              </thead>
              <tbody>{compRows}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {limiter ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Limiter</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-zinc-500">Pre-Limiter Peak</p>
              <p className="text-zinc-100">{fmt(limiter.pre_limiter_peak_db, 2)} dB</p>
            </div>
            <div>
              <p className="text-zinc-500">Post-Limiter Peak</p>
              <p className="text-zinc-100">{fmt(limiter.post_limiter_peak_db, 2)} dB</p>
            </div>
            <div>
              <p className="text-zinc-500">Gain Reduction</p>
              <p className="text-brass">{fmt(limiter.limiter_gain_reduction_db, 2)} dB</p>
            </div>
          </div>
          {limiter.true_peak_aware ? (
            <p className="mt-2 text-[10px] text-zinc-500">Oversampled true-peak limiting (professional tier).</p>
          ) : null}
        </div>
      ) : null}

      {applied.saturation_amount != null || applied.width_adjustment != null ? (
        <div className="grid grid-cols-2 gap-2">
          {applied.saturation_amount != null ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-zinc-500">Saturation Amount</p>
              <p className="text-zinc-100">{fmt(applied.saturation_amount, 4)}</p>
            </div>
          ) : null}
          {applied.width_adjustment != null ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-zinc-500">Width Adjustment</p>
              <p className="text-zinc-100">{fmt(applied.width_adjustment, 4)}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
