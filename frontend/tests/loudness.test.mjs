// The in-browser LUFS meter (src/lib/loudness.js) must agree with the
// engine's meter (backend/ai_mastering/analysis/loudness.py FastMeter +
// audio_utils._true_peak_db). Reference values were produced by running
// those Python functions on the same float32 signals built below.
import test from "node:test";
import assert from "node:assert/strict";

import { measureLoudness } from "../src/lib/loudness.js";

const SR = 44100;

function sine(amp, freq, phase = 0, seconds = 12) {
  const x = new Float32Array(SR * seconds);
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * freq * (i / SR) + phase);
  return x;
}

const CASES = [
  { name: "1 kHz sine at -20 dBFS", signal: sine(0.1, 1000), ref: [-20.035433, -19.994527, 0.752589] },
  // Inter-sample peaks: sample peak is below 0.9, true peak isn't.
  { name: "19 kHz sine (inter-sample peaks)", signal: sine(0.9, 19000, 0.3), ref: [2.393846, -0.909655, 0.752626] },
  { name: "quiet 220 Hz sine", signal: sine(0.01, 220), ref: [-40.944482, -39.994474, 0.752453] },
];

for (const { name, signal, ref } of CASES) {
  test(`matches the engine: ${name}`, () => {
    const m = measureLoudness([signal, signal], SR);
    assert.ok(Math.abs(m.integrated_lufs - ref[0]) < 0.01, `integrated ${m.integrated_lufs} vs ${ref[0]}`);
    assert.ok(Math.abs(m.true_peak_db - ref[1]) < 0.01, `true peak ${m.true_peak_db} vs ${ref[1]}`);
    assert.ok(Math.abs(m.loudness_range_lu - ref[2]) < 0.01, `LRA ${m.loudness_range_lu} vs ${ref[2]}`);
  });
}

test("mono input is measured as dual-mono, like the engine", () => {
  const s = sine(0.1, 1000);
  assert.deepEqual(measureLoudness([s], SR), measureLoudness([s, s], SR));
});

test("digital silence reads -Infinity integrated loudness", () => {
  const z = new Float32Array(SR * 5);
  assert.equal(measureLoudness([z, z], SR).integrated_lufs, -Infinity);
});
