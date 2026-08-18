import fs from "node:fs";

import cors from "cors";
import express from "express";

import { settings } from "./config/settings.js";
import { requireAuth } from "./middleware/auth.js";
import masteringRoutes from "./routes/masteringRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";

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

// Every route requires a signed-in Firebase user except /health (load
// balancers/uptime monitors don't carry a user token), /admin/* (gated
// instead by requireAdminKey in masteringRoutes.js), and /webhooks/*
// (gated by signature verification, handled above and already responded
// to by the time a request would reach here).
app.use((req, res, next) => {
  if (req.path === "/health" || req.path.startsWith("/admin/") || req.path.startsWith("/webhooks/")) return next();
  return requireAuth(req, res, next);
});

app.use("/", masteringRoutes);

app.listen(settings.port, () => {
  console.log(`${settings.appTitle} listening on http://localhost:${settings.port}`);
});
