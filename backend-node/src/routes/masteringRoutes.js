import fs from "node:fs";
import path from "node:path";

import express from "express";
import multer from "multer";

import { GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { processMastering } from "../services/masteringService.js";
import { analyzeChords, cleanAudio } from "../services/chordCleanService.js";
import { listMixPresets } from "../services/presetsService.js";
import { importCustomPreset, deleteCustomPreset } from "../services/customPresetsService.js";

const router = express.Router();

const upload = multer({
  dest: settings.uploadDir,
  limits: {
    fileSize: settings.maxUploadMb * 1024 * 1024,
  },
});

router.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", runtime: "node" });
});

router.get("/genres", (_req, res) => {
  res.json({ genres: GENRES });
});

router.get("/tags", (_req, res) => {
  res.json({ tags: TAGS });
});

router.get("/styles", (_req, res) => {
  res.json({ styles: STYLES });
});

router.get("/mix-presets", (_req, res) => {
  res.json(listMixPresets());
});

router.post("/import-preset", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  try {
    const jsonText = fs.readFileSync(req.file.path, "utf-8");
    const preset = importCustomPreset(jsonText);
    return res.json(preset);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Preset import failed" });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

router.delete("/custom-presets/:name", (req, res) => {
  const removed = deleteCustomPreset(req.params.name);
  if (!removed) {
    return res.status(404).json({ detail: "Custom preset not found" });
  }
  return res.json({ ok: true });
});

router.post("/master", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }

  try {
    const tags = JSON.parse(req.body.tags || "[]");
    const tweaks = JSON.parse(req.body.tweaks || "{}");

    const result = await processMastering({
      file: req.file,
      fields: {
        genre: req.body.genre || null,
        style: req.body.style || "modern",
        tags,
        tweaks,
        use_stem_separation: req.body.use_stem_separation === "true",
        output_format: req.body.output_format || "wav",
        mix_preset: req.body.mix_preset || null,
        tier: req.body.tier || "standard",
      },
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Mastering failed" });
  }
});

router.post("/analyze-chords", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  try {
    const result = await analyzeChords(req.file);
    return res.json(result);
  } catch (error) {
    const detail = error?.stderr || error?.message || "Chord detection failed";
    return res.status(500).json({ detail });
  }
});

router.post("/clean", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  try {
    const result = await cleanAudio(req.file, req.body.output_format || "mp3");
    return res.json(result);
  } catch (error) {
    const detail = error?.stderr || error?.message || "Cleanup failed";
    return res.status(500).json({ detail });
  }
});

router.get("/download/:jobId.:ext", (req, res) => {
  const { jobId, ext } = req.params;
  const outPath = path.join(settings.outputDir, `${jobId}_mastered.${ext}`);
  if (!fs.existsSync(outPath)) {
    return res.status(404).json({ detail: "File not found" });
  }
  return res.download(outPath);
});

router.get("/original/:jobId", (req, res) => {
  const prefix = `${req.params.jobId}_input`;
  const files = fs.readdirSync(settings.uploadDir).filter((name) => name.startsWith(prefix));
  if (!files.length) {
    return res.status(404).json({ detail: "Original not found" });
  }
  return res.sendFile(path.join(settings.uploadDir, files[0]));
});

export default router;
