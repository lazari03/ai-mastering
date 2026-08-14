import fs from "node:fs";

import cors from "cors";
import express from "express";

import { settings } from "./config/settings.js";
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

app.use("/", masteringRoutes);

app.listen(settings.port, () => {
  console.log(`${settings.appTitle} listening on http://localhost:${settings.port}`);
});
