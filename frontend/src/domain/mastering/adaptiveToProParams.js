// Reshapes the adaptive engine's live preview computation (the exact same
// per-band-deltas representation a real Quick-mode render would compute —
// see backend's compute_processing_params / preview_processing_params)
// into the literal manual-spec shape Pro Master's knobs (ProParamsPanel)
// and the DSP engine's "processing" field actually use — a single bus
// compressor, an explicit EQ band list, etc. These are two genuinely
// different representations (adaptive: per-band deltas computed from
// measurement; manual: literal values applied verbatim), not the same
// data reformatted — this is a best-effort, real-values translation
// between them, not an exact inverse.
//
// Purpose: so picking a mastering objective/tag while in Pro mode (or
// switching into Pro mode with one already selected) seeds the manual
// knobs with real, track-specific starting values instead of the same
// flat defaults for every track — the user hand-tunes from there. This
// applies once per objective/tag change, not a continuous link — editing
// a knob afterward doesn't get silently overwritten until the objective
// selection itself changes again.

// Representative center frequency for each of the 7 analysis bands —
// the adaptive engine works in band *shares* of spectral energy, not
// discrete EQ points, so this is the reasonable single frequency a
// mastering engineer would reach for to address that band.
const BAND_CENTER_HZ = {
  sub_bass_20_60hz: 40,
  bass_60_250hz: 120,
  low_mid_250_500hz: 350,
  mid_500_2000hz: 1000,
  high_mid_2000_4000hz: 3000,
  presence_4000_6000hz: 5000,
  brilliance_6000_20000hz: 10000,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

export function mapAdaptiveParamsToProParams(params, currentProParams) {
  if (!params) return currentProParams;

  const eq = Object.entries(params.per_band_gain_changes_db || {})
    .filter(([band]) => BAND_CENTER_HZ[band] != null)
    .map(([band, gainDb]) => ({
      frequency_hz: BAND_CENTER_HZ[band],
      gain_db: Math.round(clamp(Number(gainDb) || 0, -12, 12) * 10) / 10,
      q: 1.0,
    }));

  // One bus compressor from Pro's manual perspective vs the adaptive
  // engine's several per-band ones (band names vary by tier — "low"/
  // "high" for standard, "sub"/"punch" for professional — Object.values
  // sidesteps needing to know which set is present) — averaged, not
  // picked from one band, so the starting point reflects the overall
  // correction rather than just whichever band happened to need the most.
  const ratio = mean(Object.values(params.band_compression_ratio || {}));
  const attackMs = mean(Object.values(params.band_attack_ms || {}));
  const releaseMs = mean(Object.values(params.band_release_ms || {}));
  const maxGainReductionDb = mean(Object.values(params.band_max_gain_reduction_db || {}));

  const saturationAmount = typeof params.saturation_amount === "number" ? params.saturation_amount : null;
  const targetLufs = typeof params.target_lufs === "number" ? params.target_lufs : null;

  return {
    ...currentProParams,
    ...(eq.length ? { eq } : {}),
    bus_compressor: {
      ...currentProParams.bus_compressor,
      ...(ratio != null ? { ratio: Math.round(clamp(ratio, 1, 8) * 100) / 100 } : {}),
      ...(attackMs != null ? { attack_ms: Math.round(clamp(attackMs, 1, 100)) } : {}),
      ...(releaseMs != null ? { release_ms: Math.round(clamp(releaseMs, 30, 500)) } : {}),
      ...(maxGainReductionDb != null ? { max_gain_reduction_db: Math.round(clamp(maxGainReductionDb, 0, 12) * 10) / 10 } : {}),
    },
    saturation: {
      ...currentProParams.saturation,
      ...(saturationAmount != null
        ? { enabled: saturationAmount > 0.01, amount: Math.round(clamp(saturationAmount, 0, 0.15) * 1000) / 1000 }
        : {}),
    },
    limiter: {
      ...currentProParams.limiter,
      ...(targetLufs != null ? { target_lufs_i: Math.round(clamp(targetLufs, -16, -6) * 10) / 10 } : {}),
    },
    // input/highpass/stereo/clipper/output deliberately left untouched —
    // the adaptive engine's stereo/limiter-release/highpass handling
    // isn't a clean 1:1 fit for this shape, and these are the kind of
    // mix-hygiene toggles a user should opt into deliberately rather than
    // have silently flipped by picking a tag.
  };
}
