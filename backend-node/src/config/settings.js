import path from "node:path";
import crypto from "node:crypto";
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
  // The real frontend's public origin (e.g. https://auralithforge.app) —
  // same var CORS_ORIGINS is seeded from in docker-compose.yml. Used to
  // build share links (see /jobs/:jobId/share) that point at the
  // frontend's own simple download page instead of straight at this API.
  // Falls back to null, in which case the route builds the link from the
  // incoming request's own host instead — fine for local dev, not
  // something to rely on in production (a request can be spoofed/proxied
  // in ways that make req.host unreliable for anything security-sensitive,
  // though a share link's own token is what's actually authoritative here).
  frontendOrigin: process.env.FRONTEND_ORIGIN || null,
  uploadDir: toAbs(process.env.UPLOAD_DIR, "uploads"),
  outputDir: toAbs(process.env.OUTPUT_DIR, "outputs"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  // Absolute session lifetime — a Firebase ID token itself only lives 1h,
  // but the client SDK silently refreshes it forever in the background as
  // long as the browser holds a refresh token, so "signed in" otherwise
  // never actually expires on its own. This caps it: once decoded.auth_time
  // (the timestamp of the original sign-in, not the last token refresh) is
  // older than this many days, requireAuth rejects the token and the
  // frontend force-signs-out. See requireAuth.js.
  sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS || 14),
  // Signs the short-lived download tokens that let <a href download>/
  // <audio src>/direct navigation reach the auth-gated download routes
  // (see services/downloadTokenService.js) — neither can attach an
  // Authorization header the way a real fetch() call can. Falls back to a
  // random secret generated at boot so local dev works with zero setup;
  // set DOWNLOAD_TOKEN_SECRET for real in production so tokens survive a
  // restart (an unset one invalidates every outstanding link on redeploy —
  // not a security problem, just an avoidable rough edge).
  downloadTokenSecret: process.env.DOWNLOAD_TOKEN_SECRET || crypto.randomBytes(32).toString("hex"),
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
  // PRICING.md for the plan this backs: 2 subscription tiers, no à la
  // carte purchases at all —
  //   Free    — 3 Standard masters/month, no Professional, no stems, no chords
  //   Studio  — 50 masters/month (Standard + Professional), stems included, no chords
  //   All-Access — 250 masters/month, stems, unlimited chord detection
  // Every paid feature is plan-only now — see entitlementsService.js's
  // PLAN_MASTER_LIMITS and masteringRoutes.js's gating. Unset product IDs
  // just mean that plan can't be checked out yet (checkout route 400s with
  // a clear message), not a crash; the free tier works with none of this set.
  polarAccessToken: process.env.POLAR_ACCESS_TOKEN || null,
  polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET || null,
  polarServer: process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
  polarProducts: {
    planStudio: process.env.POLAR_PLAN_STUDIO_PRODUCT_ID || null,
    planPro: process.env.POLAR_PLAN_PRO_PRODUCT_ID || null,
    // One-time purchase, not a subscription — "master this one track"
    // for someone who doesn't want a recurring plan. Create this as a
    // one-time (not recurring) product in Polar's dashboard and set its
    // ID here; see entitlementsService.js's extra-credit functions and
    // polarService.js's order.paid webhook handling.
    singleMaster: process.env.POLAR_SINGLE_MASTER_PRODUCT_ID || null,
    // Also one-time, not a subscription — chord detection as its own
    // standalone product (a guitarist who wants chords for one song has
    // no reason to buy a mastering plan). Priced below Single Master —
    // analysis-only (madmom/essentia), no multi-stage DSP render, no
    // audio file written out, genuinely cheaper to serve per request.
    chordDetection: process.env.POLAR_CHORD_DETECTION_PRODUCT_ID || null,
  },
};
