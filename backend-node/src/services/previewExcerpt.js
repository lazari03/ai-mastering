import path from "node:path";

import { execFileAsync } from "./masteringService.js";

// The free preview masters a 30 s excerpt. It used to be the FIRST 30 s
// (usually the intro — the quietest, sparsest part), cut to ffmpeg's
// default 16-bit WAV. That made the preview unrepresentative twice over:
// the engine's loudness/limiter/EQ decisions were taken on the intro, not
// the song's dense sections, and any source peaks above 0 dBFS (common on
// already-mastered MP3s) were hard-clipped before the engine ever saw
// them, while the real master decodes to float. The preview is the sales
// pitch; it has to sound like the product.
//
// Now: the LOUDEST 30 s window (by 1 s energy blocks — the section that
// drives the limiter budget and loudness decisions, and usually the
// chorus), written as 32-bit float with short fades so the cut edges don't
// click in the A/B.
export const PREVIEW_SECONDS = 30;
const ANALYSIS_RATE = 4000; // energy only — no need for full bandwidth
const FADE_SECONDS = 0.05;

// Start block of the contiguous `windowBlocks` run with the most energy.
// Pure, so it is unit-tested without ffmpeg.
export function loudestWindowStart(blockEnergies, windowBlocks) {
  const n = blockEnergies.length;
  if (n <= windowBlocks) return 0;
  let sum = 0;
  for (let i = 0; i < windowBlocks; i += 1) sum += blockEnergies[i];
  let best = sum;
  let bestStart = 0;
  for (let start = 1; start + windowBlocks <= n; start += 1) {
    sum += blockEnergies[start + windowBlocks - 1] - blockEnergies[start - 1];
    if (sum > best) {
      best = sum;
      bestStart = start;
    }
  }
  return bestStart;
}

async function blockEnergies(inputPath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", inputPath, "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
  );
  const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
  const energies = [];
  for (let start = 0; start + ANALYSIS_RATE <= samples.length; start += ANALYSIS_RATE) {
    let e = 0;
    for (let i = start; i < start + ANALYSIS_RATE; i += 1) e += samples[i] * samples[i];
    energies.push(e);
  }
  return energies;
}

export async function cutPreviewExcerpt(inputPath, workDir) {
  const outputPath = path.join(workDir, `${path.basename(inputPath)}_preview.wav`);
  let startSeconds = 0;
  try {
    startSeconds = loudestWindowStart(await blockEnergies(inputPath), PREVIEW_SECONDS);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("ffmpeg is not installed or not on PATH for this server process — install it and restart.");
    }
    // Analysis failure is not fatal: fall back to the start of the file.
    console.warn("Preview excerpt analysis failed, using the first 30 s:", error.message);
    startSeconds = 0;
  }
  const fadeOutStart = Math.max(0, PREVIEW_SECONDS - FADE_SECONDS);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", String(startSeconds),
      "-i", inputPath,
      "-t", String(PREVIEW_SECONDS),
      "-af", `afade=t=in:st=0:d=${FADE_SECONDS},afade=t=out:st=${fadeOutStart}:d=${FADE_SECONDS}`,
      "-c:a", "pcm_f32le",
      outputPath,
    ]);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("ffmpeg is not installed or not on PATH for this server process — install it and restart.");
    }
    throw error;
  }
  return { path: outputPath, startSeconds };
}
