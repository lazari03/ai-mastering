import fs from "node:fs";
import path from "node:path";

import express from "express";
import multer from "multer";

import { GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { processMastering } from "../services/masteringService.js";
import { analyzeChords, cleanAudio, previewCodec } from "../services/chordCleanService.js";
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

const masterUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "reference_file", maxCount: 1 },
]);

router.post("/master", masterUpload, async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) {
    return res.status(400).json({ detail: "file is required" });
  }
  const referenceFile = req.files?.reference_file?.[0] || null;

  try {
    const tags = JSON.parse(req.body.tags || "[]");
    const tweaks = JSON.parse(req.body.tweaks || "{}");

    const result = await processMastering({
      file,
      referenceFile,
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

router.post("/codec-preview", async (req, res) => {
  const { job_id: jobId, codec } = req.body || {};
  if (!jobId) {
    return res.status(400).json({ detail: "job_id is required" });
  }
  try {
    const result = await previewCodec(jobId, codec || "mp3_128");
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Codec preview failed" });
  }
});

// Streams a file response from the Python service through to the client.
// Codec previews and (usually) mastered/original files live in the Python
// service's own storage now, not Node's — see masteringService.js's
// pythonApiBaseUrl comment for why.
async function proxyFromPython(pythonPath, res, notFoundMessage) {
  let upstream;
  try {
    upstream = await fetch(`${settings.pythonApiBaseUrl}${pythonPath}`);
  } catch (error) {
    return res.status(502).json({ detail: `Cannot reach Python service: ${error.message}` });
  }
  if (!upstream.ok) {
    return res.status(upstream.status === 404 ? 404 : 502).json({ detail: notFoundMessage });
  }
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return res.send(buffer);
}

router.get("/download-codec-preview/:jobId/:codec", (req, res) => {
  const { jobId, codec } = req.params;
  return proxyFromPython(`/download-codec-preview/${jobId}/${codec}`, res, "Codec preview not found — run /codec-preview first");
});

router.get("/download/:jobId.:ext", (req, res) => {
  const { jobId, ext } = req.params;
  // Local file first — covers the legacy node_ffmpeg engine path, which
  // still writes directly to Node's own outputDir (see
  // masteringService.js:processMasteringViaFfmpegFallback). Everything
  // else (the default path) is mastered by the Python service and lives
  // in its storage instead.
  const localPath = path.join(settings.outputDir, `${jobId}_mastered.${ext}`);
  if (fs.existsSync(localPath)) {
    return res.download(localPath);
  }
  return proxyFromPython(`/download/${jobId}.${ext}`, res, "File not found");
});

router.get("/original/:jobId", (req, res) => {
  const prefix = `${req.params.jobId}_input`;
  const localMatches = fs.readdirSync(settings.uploadDir).filter((name) => name.startsWith(prefix));
  if (localMatches.length) {
    return res.sendFile(path.join(settings.uploadDir, localMatches[0]));
  }
  return proxyFromPython(`/original/${req.params.jobId}`, res, "Original not found");
});

export default router;
