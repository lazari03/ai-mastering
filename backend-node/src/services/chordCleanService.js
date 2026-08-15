import { postMultipartToPython } from "./masteringService.js";

const SUPPORTED_CODECS = new Set(["mp3_128", "mp3_320", "aac_128", "aac_256", "opus_128"]);

export async function analyzeChords(file) {
  return postMultipartToPython("/analyze-chords", {
    files: { file: { path: file.path, filename: file.originalname || "input.wav" } },
  });
}

// Operates on a job that already went through /master — the Python service
// looks up ${jobId}_mastered.wav in its own storage, keyed by the job_id it
// generated when that job ran (see masteringService.js:processMastering,
// which now uses the Python service's job_id as the canonical one).
export async function previewCodec(jobId, codec = "mp3_128") {
  if (!SUPPORTED_CODECS.has(codec)) {
    throw new Error(`Unknown codec '${codec}'. Options: ${[...SUPPORTED_CODECS].join(", ")}`);
  }
  return postMultipartToPython("/codec-preview", {
    fields: { job_id: jobId, codec },
  });
}

export async function cleanAudio(file, outputFormat = "mp3") {
  const outExt = outputFormat === "wav" ? "wav" : "mp3";
  return postMultipartToPython("/clean", {
    fields: { output_format: outExt },
    files: { file: { path: file.path, filename: file.originalname || "input.wav" } },
  });
}
