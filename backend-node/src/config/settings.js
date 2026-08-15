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
  // The Python side is now a long-lived FastAPI service (uvicorn), not a
  // fresh subprocess per request — see backend/app/main.py. Node forwards
  // requests to it over HTTP and proxies its file responses back. Start it
  // with:
  //   cd backend && venv312/bin/python -m uvicorn app.main:app --port 8001
  // Required — there is no subprocess-CLI fallback (that would just be a
  // second, duplicate way of reaching the same DSP code to maintain).
  // The backend/*_cli.py scripts still exist and work standalone (used by
  // validate_mastering.py and direct dev testing) — Node just doesn't call
  // them anymore.
  pythonApiBaseUrl: process.env.PYTHON_API_BASE_URL || "http://localhost:8001",
  presetsFile: path.resolve(rootDir, "../backend/mixing_presets.json"),
  // Separate file so imported presets never touch the curated built-in list.
  customPresetsFile: toAbs(process.env.CUSTOM_PRESETS_FILE, "custom_presets.json"),
};
