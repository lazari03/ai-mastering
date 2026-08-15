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
// the mastered file simply being louder. Used here only as a fallback for
// the legacy node_ffmpeg engine path, which doesn't go through Python.
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

function resolveConfig(input) {
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
    const preset = getMixPresetByName(mix_preset);
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

export function parseJsonFromStdout(stdout) {
  const trimmed = (stdout || "").trim();
  if (!trimmed) {
    throw new Error("Adaptive DSP did not return JSON output");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        // Continue scanning lines backward for JSON output.
      }
    }
  }

  throw new Error("Adaptive DSP returned invalid JSON output");
}

async function runAdaptiveDsp({ inputPath, wavOut, config, referencePath }) {
  const args = [
    settings.adaptiveCliScript,
    "--input",
    inputPath,
    "--output",
    wavOut,
    "--genre",
    config.genre,
    "--style",
    config.style,
    "--tags-json",
    JSON.stringify(config.tags || []),
    "--tweaks-json",
    JSON.stringify(config.tweaks || {}),
    "--tier",
    config.tier === "professional" ? "professional" : "standard",
  ];

  if (config.use_stem_separation) {
    args.push("--use-stem-separation");
  }
  if (referencePath) {
    args.push("--reference", referencePath);
  }

  const { stdout } = await execFileAsync(settings.adaptivePythonBin, args, {
    maxBuffer: 20 * 1024 * 1024,
  });

  return parseJsonFromStdout(stdout);
}

async function runPresetDsp({ inputPath, wavOut, fullPreset }) {
  const presetFile = path.join(settings.uploadDir, `${randomUUID().slice(0, 8)}_preset.json`);
  fs.writeFileSync(presetFile, JSON.stringify(fullPreset));

  try {
    const { stdout } = await execFileAsync(
      settings.adaptivePythonBin,
      [settings.presetDspCliScript, "--input", inputPath, "--output", wavOut, "--preset-file", presetFile],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    return parseJsonFromStdout(stdout);
  } finally {
    fs.unlink(presetFile, () => {});
  }
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

export async function decodeIfNeeded(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (!AUDIO_DECODE_EXTS.has(ext)) return inputPath;
  const decoded = inputPath.replace(ext, "_decoded.wav");
  await runFfmpeg(["-i", inputPath, "-ac", "2", "-ar", "44100", "-codec:a", "pcm_s16le", decoded]);
  return decoded;
}

export async function processMastering({ file, referenceFile = null, fields }) {
  const config = resolveConfig(fields);
  const jobId = randomUUID().slice(0, 8);
  const inputExt = path.extname(file.originalname || "") || ".wav";
  const inputPath = path.join(settings.uploadDir, `${jobId}_input${inputExt}`);
  fs.copyFileSync(file.path, inputPath);

  const processingInput = await decodeIfNeeded(inputPath);

  // Spectral matching only applies to the adaptive engine — a full preset
  // spec is a literal instruction set, there's no "target spectral balance"
  // slot in it to override.
  let referenceInput = null;
  if (referenceFile && !config.fullPreset) {
    const referenceExt = path.extname(referenceFile.originalname || "") || ".wav";
    const referencePath = path.join(settings.uploadDir, `${jobId}_reference${referenceExt}`);
    fs.copyFileSync(referenceFile.path, referencePath);
    referenceInput = await decodeIfNeeded(referencePath);
  }

  const wavOut = path.join(settings.outputDir, `${jobId}_mastered.wav`);
  const outExt = config.output_format === "mp3" ? "mp3" : "wav";
  const finalOut = path.join(settings.outputDir, `${jobId}_mastered.${outExt}`);

  if (config.fullPreset) {
    let presetResult;
    try {
      presetResult = await runPresetDsp({ inputPath: processingInput, wavOut, fullPreset: config.fullPreset });
    } catch (error) {
      const detail = error?.stderr || error?.message || "unknown error";
      throw new Error(`Preset DSP engine failed: ${detail}`);
    }

    if (outExt === "mp3") {
      await runFfmpeg(["-i", wavOut, "-codec:a", "libmp3lame", "-b:a", "320k", finalOut]);
    } else {
      fs.copyFileSync(wavOut, finalOut);
    }

    const beforeLufsRaw = Number(presetResult?.analysis_before?.integrated_lufs);
    const afterLufsRaw = Number(presetResult?.analysis_after?.integrated_lufs);

    return {
      job_id: jobId,
      download_url: `/download/${jobId}.${outExt}`,
      before_lufs: Number((Number.isFinite(beforeLufsRaw) ? beforeLufsRaw : -14).toFixed(1)),
      after_lufs: Number((Number.isFinite(afterLufsRaw) ? afterLufsRaw : -11).toFixed(1)),
      analysis_before: presetResult?.analysis_before || { integrated_lufs: -14 },
      analysis_after: presetResult?.analysis_after || { integrated_lufs: -11 },
      ab_gain_match: presetResult?.ab_gain_match || null,
      quality_control: presetResult?.quality_control || null,
      processing_applied: presetResult?.processing_applied || { engine: "preset_dsp_engine" },
      target_profile_used: presetResult?.target_profile_used || { genre: config.genre, style: config.style },
    };
  }

  if (settings.masteringEngine === "adaptive_python") {
    let adaptiveResult;
    try {
      adaptiveResult = await runAdaptiveDsp({ inputPath: processingInput, wavOut, config, referencePath: referenceInput });
    } catch (error) {
      const detail = error?.stderr || error?.message || "unknown error";
      throw new Error(`Adaptive DSP engine failed: ${detail}`);
    }

    if (outExt === "mp3") {
      await runFfmpeg(["-i", wavOut, "-codec:a", "libmp3lame", "-b:a", "320k", finalOut]);
    } else {
      fs.copyFileSync(wavOut, finalOut);
    }

    const beforeLufsRaw = Number(adaptiveResult?.analysis_before?.integrated_lufs);
    const afterLufsRaw = Number(adaptiveResult?.analysis_after?.integrated_lufs);

    return {
      job_id: jobId,
      download_url: `/download/${jobId}.${outExt}`,
      before_lufs: Number((Number.isFinite(beforeLufsRaw) ? beforeLufsRaw : -14).toFixed(1)),
      after_lufs: Number((Number.isFinite(afterLufsRaw) ? afterLufsRaw : -11).toFixed(1)),
      analysis_before: adaptiveResult?.analysis_before || { integrated_lufs: -14 },
      analysis_after: adaptiveResult?.analysis_after || { integrated_lufs: -11 },
      ab_gain_match: adaptiveResult?.ab_gain_match || null,
      processing_applied: {
        ...(adaptiveResult?.processing_applied || {}),
        engine: "adaptive_python_dsp",
      },
      target_profile_used: adaptiveResult?.target_profile_used || {
        genre: config.genre,
        style: config.style,
      },
    };
  }

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
