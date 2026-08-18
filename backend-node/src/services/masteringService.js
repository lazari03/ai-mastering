import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { AUDIO_DECODE_EXTS, GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { getMixPresetByName } from "./presetsService.js";

export const execFileAsync = promisify(execFile);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Mirrors ai_mastering/audio_utils.py:_ab_gain_match — attenuate the louder
// side down to the quieter side's LUFS so an A/B comparison isn't biased by
// the mastered file simply being louder. Used here only for the legacy
// node_ffmpeg engine path, which doesn't go through Python at all.
function computeAbGainMatch(beforeLufs, afterLufs) {
  if (!Number.isFinite(beforeLufs) || !Number.isFinite(afterLufs)) return null;
  const target = Math.min(beforeLufs, afterLufs);
  return {
    reference_lufs: Number(target.toFixed(3)),
    before_gain_db: Number((target - beforeLufs).toFixed(3)),
    after_gain_db: Number((target - afterLufs).toFixed(3)),
  };
}

function normalizeTweaks(raw = {}) {
  const keys = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"];
  const out = {};
  for (const key of keys) {
    const val = Number(raw[key] ?? 0);
    out[key] = Number.isFinite(val) ? clamp(val, -1, 1) : 0;
  }
  return out;
}

async function resolveConfig(input, uid) {
  const {
    genre,
    style = "modern",
    tags = [],
    tweaks = {},
    use_stem_separation = false,
    output_format = "wav",
    mix_preset = null,
    tier = "standard",
  } = input;

  const resolved = {
    genre,
    style,
    tags: Array.isArray(tags) ? tags : [],
    tweaks: normalizeTweaks(tweaks),
    use_stem_separation: Boolean(use_stem_separation),
    output_format: output_format === "mp3" ? "mp3" : "wav",
    // "standard" is what free users hit today, byte-for-byte unchanged.
    // "professional" splits sub/punch bass bands and true-peak limits
    // instead of pedalboard.Limiter's makeup-gain-prone one.
    tier: tier === "professional" ? "professional" : "standard",
    // Only ever comes from a preset — a full professional preset (with a
    // "processing" block) routes /master to preset_dsp_engine instead of
    // the genre-based adaptive engine. See resolveConfig's mix_preset branch.
    fullPreset: null,
  };

  if (mix_preset) {
    const preset = await getMixPresetByName(mix_preset, uid);
    if (!preset) {
      throw new Error(`Unknown mixing preset '${mix_preset}'`);
    }
    resolved.genre = preset.genre || resolved.genre;
    resolved.style = preset.style || resolved.style;
    resolved.tags = preset.tags || resolved.tags;
    resolved.tweaks = normalizeTweaks(preset.tweaks || resolved.tweaks);
    resolved.use_stem_separation = Boolean(preset.use_stem_separation);
    resolved.output_format = preset.output_format === "mp3" ? "mp3" : "wav";
    if (preset.processing) {
      resolved.fullPreset = {
        name: mix_preset,
        genre: resolved.genre,
        style: resolved.style,
        processing: preset.processing,
        quality_control: preset.quality_control,
        output: preset.output,
      };
    }
  }

  if (!resolved.genre || !GENRES.includes(resolved.genre)) {
    throw new Error(`Invalid genre. Options: ${GENRES.join(", ")}`);
  }
  if (!STYLES.includes(resolved.style)) {
    throw new Error(`Invalid style. Options: ${STYLES.join(", ")}`);
  }
  for (const tag of resolved.tags) {
    if (!TAGS.includes(tag)) {
      throw new Error(`Invalid tag '${tag}'.`);
    }
  }

  return resolved;
}

export async function runFfmpeg(args) {
  await execFileAsync("ffmpeg", ["-y", ...args], { maxBuffer: 20 * 1024 * 1024 });
}

// ------------------------------------------------ Python service client ---
// The Python side is a long-lived FastAPI service (see backend/app/main.py),
// not a subprocess spawned per request — see settings.js:pythonApiBaseUrl.
// One helper, reused by every feature that needs to call it (mastering,
// codec preview, chords, clean) instead of each hand-rolling its own
// fetch/FormData boilerplate.

export async function postMultipartToPython(pathname, { fields = {}, files = {} } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) {
      form.append(key, String(value));
    }
  }
  for (const [key, fileSpec] of Object.entries(files)) {
    if (!fileSpec) continue;
    const buffer = fs.readFileSync(fileSpec.path);
    form.append(key, new Blob([buffer]), fileSpec.filename || path.basename(fileSpec.path));
  }

  let response;
  try {
    response = await fetch(`${settings.pythonApiBaseUrl}${pathname}`, { method: "POST", body: form });
  } catch (error) {
    throw new Error(
      `Cannot reach Python service at ${settings.pythonApiBaseUrl}. Is it running? ` +
        `(cd backend && venv312/bin/python -m uvicorn app.main:app --port 8001). ${error.message}`
    );
  }

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    throw new Error(payload?.detail ? JSON.stringify(payload.detail) : `Python service returned HTTP ${response.status}`);
  }
  return payload;
}

function buildFilterChain({ genre, style, tags, tweaks }) {
  const isLoud = tags.includes("louder");
  const isWide = tags.includes("wider");
  const isWarm = tags.includes("warmer");
  const isBright = tags.includes("brighter");
  const isClear = tags.includes("clearer");

  const lowGain = clamp(tweaks.low_end * 2.2 + (genre === "hiphop" || genre === "edm" ? 0.8 : 0), -3.5, 3.5);
  const presenceGain = clamp(tweaks.presence * 2.0 + (isClear ? 0.8 : 0), -3.0, 3.0);
  const highGain = clamp(tweaks.brightness * 2.4 + (isBright ? 1.0 : 0), -3.0, 3.0);
  const warmLowMid = clamp(tweaks.warmth * 1.8 + (isWarm ? 0.8 : 0), -2.0, 2.0);
  const width = clamp(1.0 + tweaks.width * 0.25 + (isWide ? 0.1 : 0), 0.8, 1.35);
  const compRatio = clamp(1.35 + tweaks.punch * 0.4 + (isLoud ? 0.2 : 0), 1.1, 2.4);

  const targetLufs = (() => {
    const baseByGenre = {
      pop: -10,
      hiphop: -9,
      rock: -10.5,
      edm: -8.5,
      acoustic: -13,
      lofi: -12,
      podcast: -16,
      classical: -18,
    };
    const styleAdjust = {
      modern: 0,
      rock_90s: -1,
      rock_2000s: -0.5,
      rock_modern: 0.6,
      electronic_modern: 1,
    };
    const genreBase = baseByGenre[genre] ?? -11;
    const sAdj = styleAdjust[style] ?? 0;
    const loudAdj = tweaks.loudness * 1.4 + (isLoud ? 0.7 : 0);
    return clamp(genreBase + sAdj + loudAdj, -20, -7);
  })();

  return {
    targetLufs,
    filter: [
      "highpass=f=30",
      `equalizer=f=90:width_type=o:width=2:g=${lowGain.toFixed(3)}`,
      `equalizer=f=320:width_type=o:width=1.5:g=${warmLowMid.toFixed(3)}`,
      `equalizer=f=2800:width_type=o:width=1.4:g=${presenceGain.toFixed(3)}`,
      `equalizer=f=8500:width_type=o:width=1.2:g=${highGain.toFixed(3)}`,
      `acompressor=ratio=${compRatio.toFixed(3)}:attack=18:release=240:makeup=1`,
      `extrastereo=m=${width.toFixed(3)}`,
      `loudnorm=I=${targetLufs.toFixed(2)}:TP=-1.2:LRA=9`,
      "alimiter=limit=0.97",
    ].join(","),
  };
}

async function readIntegratedLufs(filePath) {
  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-i", filePath, "-filter_complex", "ebur128=framelog=verbose", "-f", "null", "-"],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const match = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    if (!match || !match.length) return null;
    const last = match[match.length - 1].match(/-?\d+(?:\.\d+)?/);
    return last ? Number(last[0]) : null;
  } catch {
    return null;
  }
}

export async function decodeIfNeeded(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (!AUDIO_DECODE_EXTS.has(ext)) return inputPath;
  const decoded = inputPath.replace(ext, "_decoded.wav");
  await runFfmpeg(["-i", inputPath, "-ac", "2", "-ar", "44100", "-codec:a", "pcm_s16le", decoded]);
  return decoded;
}

// Legacy engine, only reachable if MASTERING_ENGINE is explicitly set to
// anything other than "adaptive_python" — a much cruder ffmpeg -af filter
// chain, entirely local to Node, no Python involved. Kept self-contained
// (its own local jobId/file storage) rather than folded into the Python-
// backed path below, since it's a genuinely different, simpler mechanism.
async function processMasteringViaFfmpegFallback({ file, config }) {
  const jobId = randomUUID().slice(0, 8);
  const inputExt = path.extname(file.originalname || "") || ".wav";
  const inputPath = path.join(settings.uploadDir, `${jobId}_input${inputExt}`);
  fs.copyFileSync(file.path, inputPath);

  const processingInput = await decodeIfNeeded(inputPath);
  const wavOut = path.join(settings.outputDir, `${jobId}_mastered.wav`);
  const outExt = config.output_format === "mp3" ? "mp3" : "wav";
  const finalOut = path.join(settings.outputDir, `${jobId}_mastered.${outExt}`);

  const beforeLufsRaw = await readIntegratedLufs(processingInput);
  const chain = buildFilterChain(config);

  await runFfmpeg(["-i", processingInput, "-af", chain.filter, wavOut]);

  if (outExt === "mp3") {
    await runFfmpeg(["-i", wavOut, "-codec:a", "libmp3lame", "-b:a", "320k", finalOut]);
  } else {
    fs.copyFileSync(wavOut, finalOut);
  }

  const afterLufsRaw = await readIntegratedLufs(finalOut);

  return {
    job_id: jobId,
    download_url: `/download/${jobId}.${outExt}`,
    before_lufs: Number((beforeLufsRaw ?? -14).toFixed(1)),
    after_lufs: Number((afterLufsRaw ?? chain.targetLufs).toFixed(1)),
    analysis_before: { integrated_lufs: beforeLufsRaw ?? -14 },
    analysis_after: { integrated_lufs: afterLufsRaw ?? chain.targetLufs },
    ab_gain_match: computeAbGainMatch(beforeLufsRaw ?? -14, afterLufsRaw ?? chain.targetLufs),
    processing_applied: {
      config,
      ffmpeg_filter: chain.filter,
      engine: "node_ffmpeg",
    },
    target_profile_used: {
      genre: config.genre,
      style: config.style,
      target_lufs: chain.targetLufs,
    },
  };
}

export async function processMastering({ file, referenceFile = null, fields, uid }) {
  const config = await resolveConfig(fields, uid);

  if (settings.masteringEngine !== "adaptive_python") {
    return processMasteringViaFfmpegFallback({ file, config });
  }

  // No local decode/save needed here — the Python service does its own
  // input decoding and output-format conversion, and owns its own
  // uploads/outputs storage under whatever job_id it generates. Node just
  // forwards the raw upload(s) and relays the response.
  const pythonFields = {
    genre: config.genre,
    style: config.style,
    use_stem_separation: String(config.use_stem_separation),
    tags: JSON.stringify(config.tags || []),
    tweaks: JSON.stringify(config.tweaks || {}),
    output_format: config.output_format,
    tier: config.tier,
  };
  if (config.fullPreset) {
    pythonFields.full_preset_json = JSON.stringify(config.fullPreset);
  }

  const files = { file: { path: file.path, filename: file.originalname || "input.wav" } };
  // Spectral matching only applies to the adaptive engine — a full preset
  // spec is a literal instruction set, there's no "target spectral balance"
  // slot in it to override.
  if (referenceFile && !config.fullPreset) {
    files.reference_file = { path: referenceFile.path, filename: referenceFile.originalname || "reference.wav" };
  }

  let result;
  try {
    result = await postMultipartToPython("/master", { fields: pythonFields, files });
  } catch (error) {
    throw new Error(`Mastering failed: ${error.message}`);
  }

  return {
    job_id: result.job_id,
    download_url: result.download_url,
    before_lufs: result.before_lufs,
    after_lufs: result.after_lufs,
    analysis_before: result.analysis_before,
    analysis_after: result.analysis_after,
    ab_gain_match: result.ab_gain_match || null,
    source_warnings: result.source_warnings || [],
    quality_control: result.quality_control || null,
    processing_applied: {
      ...result.processing_applied,
      // Python's own dict doesn't set this — preset_dsp_engine's response
      // already carries "engine": "preset_dsp_engine" from render_preset_
      // master()'s own return value, so this only fills in the adaptive
      // engine's case without overwriting that.
      engine: result.processing_applied?.engine || "adaptive_python_dsp",
    },
    target_profile_used: result.target_profile_used,
  };
}
