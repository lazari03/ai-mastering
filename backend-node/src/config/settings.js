import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

const toAbs = (value, fallbackRel) => path.resolve(rootDir, value || fallbackRel);

export const settings = {
  appTitle: "AI Mastering API (Node)",
  appVersion: "1.0.0",
  port: Number(process.env.PORT || 8000),
  masteringEngine: process.env.MASTERING_ENGINE || "adaptive_python",
  corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((v) => v.trim()).filter(Boolean),
  uploadDir: toAbs(process.env.UPLOAD_DIR, "uploads"),
  outputDir: toAbs(process.env.OUTPUT_DIR, "outputs"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  adaptivePythonBin: toAbs(process.env.ADAPTIVE_PYTHON_BIN, "../backend/venv312/bin/python"),
  adaptiveCliScript: toAbs(process.env.ADAPTIVE_CLI_SCRIPT, "../backend/run_adaptive_mastering_cli.py"),
  chordDetectCliScript: toAbs(process.env.CHORD_DETECT_CLI_SCRIPT, "../backend/chord_detect_cli.py"),
  cleanAudioCliScript: toAbs(process.env.CLEAN_AUDIO_CLI_SCRIPT, "../backend/clean_audio_cli.py"),
  presetDspCliScript: toAbs(process.env.PRESET_DSP_CLI_SCRIPT, "../backend/render_preset_master_cli.py"),
  presetsFile: path.resolve(rootDir, "../backend/mixing_presets.json"),
  // Separate file so imported presets never touch the curated built-in list.
  customPresetsFile: toAbs(process.env.CUSTOM_PRESETS_FILE, "custom_presets.json"),
};
