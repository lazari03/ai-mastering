// Direction controls → the engine's 7 user tweaks.
//
// Nothing here is a separate DSP path: a direction is only a named
// combination of the same tweaks the knobs always sent (−1..1 each), which
// backend ai_mastering/plan.py:apply_user_tweaks_to_plan turns into labelled
// "user_tweak" decisions — e.g. warmth +1 = +0.8 dB bell at 250 Hz with a
// −0.25 dB high-shelf tilt, low_end +1 = +1.2 dB shelf at 100 Hz, loudness
// +1 = +1.25 LU on the loudness target. The adaptive engine still measures
// the track and corrects problems first; a direction only leans the result.

export const TWEAK_KEYS = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"];

export const TONES = ["balanced", "warm", "punchy", "open", "clear"];
export const INTENSITIES = ["subtle", "balanced", "strong"];
export const LOUDNESS_LEVELS = ["natural", "streaming", "loud"];

export const DEFAULT_DIRECTION = { tone: "balanced", intensity: "balanced", loudness: "streaming" };

// Tonal vectors at "balanced" intensity. Kept moderate so "strong" (×1.5)
// still stays inside the engine's ±1 range on every key.
const TONE_VECTORS = {
  balanced: {},
  warm: { warmth: 0.6, low_end: 0.3, brightness: -0.3, presence: -0.1 },
  punchy: { punch: 0.6, low_end: 0.3, presence: 0.2 },
  open: { brightness: 0.5, presence: 0.3, width: 0.4, warmth: -0.2 },
  clear: { presence: 0.6, warmth: -0.3, low_end: -0.1 },
};

const INTENSITY_SCALE = { subtle: 0.5, balanced: 1, strong: 1.5 };
const LOUDNESS_TWEAK = { natural: -0.6, streaming: 0, loud: 0.6 };

const clamp = (v) => Math.max(-1, Math.min(1, Math.round(v * 100) / 100));

// Full tweak set for a direction. A "custom" tone keeps the hand-tuned
// tonal tweaks (currentTweaks) and only applies the loudness choice.
export function tweaksForDirection(direction, currentTweaks = {}) {
  const loudness = LOUDNESS_TWEAK[direction.loudness] ?? 0;
  if (direction.tone === "custom") {
    return { ...Object.fromEntries(TWEAK_KEYS.map((k) => [k, Number(currentTweaks[k]) || 0])), loudness };
  }
  const vector = TONE_VECTORS[direction.tone] || {};
  const scale = INTENSITY_SCALE[direction.intensity] ?? 1;
  const out = {};
  for (const key of TWEAK_KEYS) out[key] = clamp((vector[key] || 0) * scale);
  out.loudness = loudness;
  return out;
}

function closestLoudness(value) {
  const v = Number(value) || 0;
  return LOUDNESS_LEVELS.reduce((best, level) =>
    Math.abs(LOUDNESS_TWEAK[level] - v) < Math.abs(LOUDNESS_TWEAK[best] - v) ? level : best
  );
}

// Direction to show for a preset: the one it was saved with, or (built-ins,
// imported presets) whichever tone+intensity reproduces its tweaks exactly,
// else "custom" so the fine-tune sliders show the real values.
export function directionFromPreset(preset, tweaks) {
  if (preset?.direction?.tone) return { ...DEFAULT_DIRECTION, ...preset.direction };
  const loudness = closestLoudness(tweaks.loudness);
  for (const tone of TONES) {
    for (const intensity of INTENSITIES) {
      const expected = tweaksForDirection({ tone, intensity, loudness });
      if (TWEAK_KEYS.every((k) => Math.abs((expected[k] || 0) - (Number(tweaks[k]) || 0)) < 0.011)) {
        return { tone, intensity, loudness };
      }
    }
  }
  return { tone: "custom", intensity: "balanced", loudness };
}

// Tiny EQ-curve glyph for each tone card: y-offsets (−1..1) across
// low → high, drawn as a smooth path. Purely illustrative of the vector.
export const TONE_CURVES = {
  balanced: [0, 0, 0, 0, 0],
  warm: [0.4, 0.7, 0.2, -0.2, -0.5],
  punchy: [0.5, 0.2, -0.1, 0.35, 0.1],
  open: [-0.1, -0.3, 0.1, 0.5, 0.8],
  clear: [-0.2, -0.5, 0.2, 0.7, 0.3],
  custom: [0.3, -0.3, 0.4, -0.2, 0.3],
};

export function curvePath(points, width = 64, height = 24) {
  const mid = height / 2;
  const amp = height * 0.4;
  const step = width / (points.length - 1);
  const xy = points.map((p, i) => [i * step, mid - p * amp]);
  let d = `M ${xy[0][0]} ${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1];
    const [x1, y1] = xy[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}
