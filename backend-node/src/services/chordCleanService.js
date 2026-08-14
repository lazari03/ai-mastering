import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { settings } from "../config/settings.js";
import { decodeIfNeeded, execFileAsync, parseJsonFromStdout, runFfmpeg } from "./masteringService.js";

export async function analyzeChords(file) {
  const jobId = randomUUID().slice(0, 8);
  const inputExt = path.extname(file.originalname || "") || ".wav";
  const inputPath = path.join(settings.uploadDir, `${jobId}_chords_input${inputExt}`);
  fs.copyFileSync(file.path, inputPath);

  const processingInput = await decodeIfNeeded(inputPath);

  const { stdout } = await execFileAsync(
    settings.adaptivePythonBin,
    [settings.chordDetectCliScript, "--input", processingInput],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  return parseJsonFromStdout(stdout);
}

export async function cleanAudio(file, outputFormat = "mp3") {
  const jobId = randomUUID().slice(0, 8);
  const inputExt = path.extname(file.originalname || "") || ".wav";
  const inputPath = path.join(settings.uploadDir, `${jobId}_clean_input${inputExt}`);
  fs.copyFileSync(file.path, inputPath);

  const processingInput = await decodeIfNeeded(inputPath);
  const wavOut = path.join(settings.outputDir, `${jobId}_mastered.wav`);
  const outExt = outputFormat === "wav" ? "wav" : "mp3";
  const finalOut = path.join(settings.outputDir, `${jobId}_mastered.${outExt}`);

  const { stdout } = await execFileAsync(
    settings.adaptivePythonBin,
    [settings.cleanAudioCliScript, "--input", processingInput, "--output", wavOut],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const result = parseJsonFromStdout(stdout);

  if (outExt === "mp3") {
    await runFfmpeg(["-i", wavOut, "-codec:a", "libmp3lame", "-b:a", "320k", finalOut]);
  } else {
    fs.copyFileSync(wavOut, finalOut);
  }

  return {
    job_id: jobId,
    download_url: `/download/${jobId}.${outExt}`,
    before_lufs: result.before_lufs,
    after_lufs: result.after_lufs,
  };
}
