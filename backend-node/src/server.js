import fs from "node:fs";

import cors from "cors";
import express from "express";

import { settings } from "./config/settings.js";
import { requireAuth } from "./middleware/auth.js";
import masteringRoutes from "./routes/masteringRoutes.js";

fs.mkdirSync(settings.uploadDir, { recursive: true });
fs.mkdirSync(settings.outputDir, { recursive: true });

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: settings.corsOrigins.includes("*") ? true : settings.corsOrigins,
  })
);

// Every route requires a signed-in Firebase user except /health — that one
// stays open for load balancers/uptime monitors, which don't carry a user
// token and shouldn't need one just to ask "are you up".
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  return requireAuth(req, res, next);
});

app.use("/", masteringRoutes);

app.listen(settings.port, () => {
  console.log(`${settings.appTitle} listening on http://localhost:${settings.port}`);
});
