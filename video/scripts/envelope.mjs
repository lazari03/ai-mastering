// Real RMS envelopes of the homepage demo (before/after), so the video's
// waveforms are the actual audio, not decoration. Also picks the loudest
// 6s window to play. Output: src/envelope.json
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const RATE = 8000, BINS = 200;
function rms(file) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const s = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const per = s.length / BINS, out = [];
  for (let i = 0; i < BINS; i++) {
    let sum = 0, n = 0;
    for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) { sum += s[j] * s[j]; n++; }
    out.push(Math.sqrt(sum / (n || 1)));
  }
  return { out, seconds: s.length / RATE };
}
const b = rms("public/pop-before.mp3"), a = rms("public/pop-after.mp3");
const max = Math.max(...b.out, ...a.out);
const before = b.out.map((v) => +(v / max).toFixed(4)), after = a.out.map((v) => +(v / max).toFixed(4));
const seconds = b.seconds, win = Math.round((6 / seconds) * BINS);
let best = 0, bestSum = -1;
for (let i = 0; i + win < BINS; i++) { const s = before.slice(i, i + win).reduce((x, y) => x + y, 0); if (s > bestSum) { bestSum = s; best = i; } }
const start = Math.floor(((best / BINS) * seconds) * 10) / 10;
writeFileSync("src/envelope.json", JSON.stringify({ seconds, before, after, start }));
console.log({ seconds, start });
