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

const SUPPORTED_CODECS = new Set(["mp3_128", "mp3_320", "aac_128", "aac_256", "opus_128"]);

// Operates on a job that already went through /master — reuses the
// ${jobId}_mastered.wav that processMastering always writes regardless of
// the job's chosen output_format, so codec preview never needs its own
// upload step.
export async function previewCodec(jobId, codec = "mp3_128") {
  if (!SUPPORTED_CODECS.has(codec)) {
    throw new Error(`Unknown codec '${codec}'. Options: ${[...SUPPORTED_CODECS].join(", ")}`);
  }
  const masteredWav = path.join(settings.outputDir, `${jobId}_mastered.wav`);
  if (!fs.existsSync(masteredWav)) {
    throw new Error(`No mastered wav found for job '${jobId}' — run /master first`);
  }
  const previewWav = path.join(settings.outputDir, `${jobId}_codec_${codec}.wav`);

  const { stdout } = await execFileAsync(
    settings.adaptivePythonBin,
    [settings.codecPreviewCliScript, "--input", masteredWav, "--output", previewWav, "--codec", codec],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const result = parseJsonFromStdout(stdout);

  return {
    ...result,
    preview_download_url: `/download-codec-preview/${jobId}/${codec}`,
  };
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
