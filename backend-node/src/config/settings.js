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
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8000),
  masteringEngine: process.env.MASTERING_ENGINE || "adaptive_python",
  corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((v) => v.trim()).filter(Boolean),
  uploadDir: toAbs(process.env.UPLOAD_DIR, "uploads"),
  outputDir: toAbs(process.env.OUTPUT_DIR, "outputs"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  // Gates the admin-only built-in preset endpoints (see
  // services/builtinPresetsService.js) — unset means those routes 501
  // rather than silently accepting an unauthenticated request.
  adminApiKey: process.env.ADMIN_API_KEY || null,
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
  // Saved Artists (user-imported presets) live in Firestore now, per-user —
  // see services/customPresetsService.js — not a local file.

  // Polar (Merchant of Record). See services/polarService.js and
  // PRICING.md for the plan this backs: a €19/mo All-Access subscription
  // (unlimited everything paid) plus four à la carte one-time products for
  // people who don't want a subscription. Each maps to one Polar product —
  // unset product IDs just mean that specific item can't be purchased yet
  // (checkout route 400s with a clear message), not a crash; the free
  // tier (Clean Audio, mastering previews) works with none of this set.
  polarAccessToken: process.env.POLAR_ACCESS_TOKEN || null,
  polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET || null,
  polarServer: process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
  polarProducts: {
    subscription: process.env.POLAR_SUBSCRIPTION_PRODUCT_ID || null,
    masterStandard: process.env.POLAR_MASTER_STANDARD_PRODUCT_ID || null,
    masterProfessional: process.env.POLAR_MASTER_PROFESSIONAL_PRODUCT_ID || null,
    chords: process.env.POLAR_CHORDS_PRODUCT_ID || null,
    stemAddon: process.env.POLAR_STEM_ADDON_PRODUCT_ID || null,
  },
};
