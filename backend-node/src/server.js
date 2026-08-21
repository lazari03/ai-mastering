import fs from "node:fs";

import cors from "cors";
import express from "express";

import { settings } from "./config/settings.js";
import { requireAuth } from "./middleware/auth.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { verifyDownloadToken } from "./services/downloadTokenService.js";
import masteringRoutes from "./routes/masteringRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { reconcileAllSubscriptions } from "./services/polarService.js";

// <a href download>, <audio src>, and direct browser navigation to a
// download-family route can't attach an Authorization header — a ?dl=
// query token (see downloadTokenService.js) is checked first as an
// alternate credential for exactly these paths, falling through to normal
// header-based requireAuth if it's missing/invalid (so a real fetch() call
// with a Bearer header, e.g. from a future non-browser client, still works
// too). ownsJob() inside each route still checks the resolved uid actually
// owns the requested job either way — this only replaces *how* the uid is
// established, not the ownership check itself.
const DOWNLOAD_PATH_PREFIXES = ["/download/", "/download-codec-preview/", "/original/"];

function isDownloadPath(reqPath) {
  return DOWNLOAD_PATH_PREFIXES.some((prefix) => reqPath.startsWith(prefix));
}

fs.mkdirSync(settings.uploadDir, { recursive: true });
fs.mkdirSync(settings.outputDir, { recursive: true });

// The "any other value silently falls back to the crude ffmpeg engine"
// behavior (see masteringService.js) is fine for local dev — it isn't fine
// in production, where it means every render silently degrades instead of
// failing loud the moment someone forgets to set this. Refuse to boot
// rather than serve worse masters with no error signal.
if (settings.nodeEnv === "production" && settings.masteringEngine !== "adaptive_python") {
  console.error(
    `Refusing to start: NODE_ENV=production but MASTERING_ENGINE=${settings.masteringEngine || "(unset)"}, ` +
      `not "adaptive_python". This would silently downgrade every render to the crude ffmpeg fallback engine. ` +
      `Set MASTERING_ENGINE=adaptive_python.`
  );
  process.exit(1);
}
if (settings.nodeEnv === "production" && settings.corsOrigins.includes("*")) {
  console.warn(
    "WARNING: CORS_ORIGINS is '*' in production — any website can call this API from a browser. " +
      "Set it to your real frontend origin(s) once you have one."
  );
}

const app = express();

// Caddy terminates HTTPS and reverse-proxies to this container over plain
// HTTP — without this, Express never trusts Caddy's X-Forwarded-Proto
// header, so req.protocol always reports "http" even though the real
// public request was HTTPS. That bug was building http:// share-download
// links (masteringRoutes.js's /shared/:jobId/info) from an HTTPS page,
// which browsers silently mixed-content-block — surfaced to the user as a
// bare "NetworkError when attempting to fetch resource" with no other
// detail. Safe to trust unconditionally here: Caddy is the only thing
// that ever talks to this container (see ARCHITECTURE.md §7 / Caddyfile).
app.set("trust proxy", true);

app.use(
  cors({
    origin: settings.corsOrigins.includes("*") ? true : settings.corsOrigins,
  })
);

// Mounted before express.json() — its own route applies express.raw()
// itself, and needs to (see webhookRoutes.js). Polar authenticates this
// via HMAC signature (verified inside the route), not a Firebase user, so
// it's also outside the requireAuth gate below.
app.use("/", webhookRoutes);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Mounted after webhookRoutes on purpose — Polar's webhook calls are never
// rate-limited (they're signature-verified, not user traffic, and Polar
// retries on failure). Generous floor under every other route; the real
// per-route protection for expensive DSP work is expensiveLimiter,
// applied directly to /master, /analyze-chords, /codec-preview.
app.use(generalLimiter);

// Every route requires a signed-in Firebase user except /health (load
// balancers/uptime monitors don't carry a user token), /validate-email
// (checked *before* an account exists — signup itself, so there's no
// token yet to require), /admin/* (gated instead by requireAdminKey in
// masteringRoutes.js), /webhooks/* (gated by signature verification,
// handled above and already responded to by the time a request would
// reach here), and /shared/* — a share link is explicitly meant for
// someone with no account at all; it's gated by its own ?token= instead
// (verifyShareToken, inside the route itself).
app.use((req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/validate-email" ||
    req.path.startsWith("/admin/") ||
    req.path.startsWith("/webhooks/") ||
    req.path.startsWith("/shared/")
  ) {
    return next();
  }

  if (isDownloadPath(req.path)) {
    const uid = verifyDownloadToken(req.query.dl);
    if (uid) {
      req.user = { uid, email: null };
      return next();
    }
  }

  return requireAuth(req, res, next);
});

app.use("/", masteringRoutes);

// Without this, anything thrown/passed to next(err) that a route didn't
// catch itself (a multer file-filter rejection, a body-size overflow, a
// genuine bug) falls through to Express's own default error handler —
// an HTML page, not this API's JSON error shape, and in some
// configurations that page can include a stack trace. One place, JSON
// always, message only (never error.stack) in the response body.
app.use((err, req, res, _next) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || (err.name === "MulterError" ? 400 : 500);
  res.status(status).json({ detail: err.message || "Something went wrong." });
});

app.listen(settings.port, () => {
  console.log(`${settings.appTitle} listening on http://localhost:${settings.port}`);
});

// Reconciliation backstop — webhooks are the fast path for keeping
// Firestore's subscription mirror in sync with Polar, but nothing catches
// a webhook that never arrives at all (endpoint unreachable during a
// deploy, wrong URL registered in Polar's dashboard, etc.). This periodic
// pass asks Polar directly for the truth on every user with a
// subscription on file and self-heals any drift. No new infra — this
// server process is already always running, so setInterval is enough;
// doesn't need a separate cron container. Runs once shortly after boot
// (catches drift from any downtime just before this deploy), then every
// 6 hours. Only in production — skips local/dev boots where
// POLAR_ACCESS_TOKEN often isn't configured at all.
if (settings.nodeEnv === "production" && settings.polarAccessToken) {
  const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const runReconciliation = () => {
    reconcileAllSubscriptions().catch((error) => {
      console.error("Subscription reconciliation pass failed:", error);
    });
  };
  setTimeout(runReconciliation, 30 * 1000);
  setInterval(runReconciliation, RECONCILE_INTERVAL_MS);
}
