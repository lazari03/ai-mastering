import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { cutPreviewExcerpt, loudestWindowStart } from "../previewExcerpt.js";

test("loudestWindowStart picks the most energetic contiguous window", () => {
  const e = [1, 1, 1, 1, 9, 9, 9, 1, 1, 1];
  assert.equal(loudestWindowStart(e, 3), 4);
  assert.equal(loudestWindowStart(e, 20), 0); // shorter than the window
  assert.equal(loudestWindowStart([5, 5, 5], 3), 0);
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("preview excerpt is the loud section, as float, with overs intact", { skip: !hasFfmpeg }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-"));
  const sr = 8000;
  const seconds = 90;
  // 40 s quiet intro, then a loud section whose peaks exceed full scale.
  const data = new Float32Array(sr * seconds * 2);
  for (let i = 0; i < sr * seconds; i += 1) {
    const t = i / sr;
    const amp = t < 40 ? 0.02 : 1.2;
    const v = amp * Math.sin(2 * Math.PI * 220 * t);
    data[2 * i] = v;
    data[2 * i + 1] = v;
  }
  const raw = path.join(dir, "in.f32");
  fs.writeFileSync(raw, Buffer.from(data.buffer));
  const input = path.join(dir, "in.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(sr), "-ac", "2", "-i", raw, "-c:a", "pcm_f32le", input]);

  const { path: out, startSeconds } = await cutPreviewExcerpt(input, dir);
  assert.ok(startSeconds >= 40, `excerpt should start in the loud section, got ${startSeconds}s`);
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out]).toString().trim();
  assert.equal(probe, "pcm_f32le");
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", out, "-f", "f32le", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 1.1, `overs above 0 dBFS must survive the cut, peak ${peak}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
