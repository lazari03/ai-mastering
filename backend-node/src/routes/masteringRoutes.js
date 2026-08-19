import fs from "node:fs";
import path from "node:path";

import express from "express";
import multer from "multer";

import { GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { processMastering, execFileAsync } from "../services/masteringService.js";
import { analyzeChords, cleanAudio, previewCodec } from "../services/chordCleanService.js";
import { listMixPresets } from "../services/presetsService.js";
import { importCustomPreset, deleteCustomPreset } from "../services/customPresetsService.js";
import { upsertBuiltInPreset, deleteBuiltInPreset } from "../services/builtinPresetsService.js";
import { saveProfile, getProfile, deleteAllUserData } from "../services/profileService.js";
import { recordJob, listJobs, ownsJob } from "../services/jobsService.js";
import { createCheckoutUrl, createPortalUrl, getSubscriptionStatus, isSubscriptionActive } from "../services/polarService.js";
import { getCredits, consumeCredit, getFreeQuotaStatus, consumeFreeQuota } from "../services/entitlementsService.js";
import { getAuth } from "../config/firebase.js";

const router = express.Router();

const upload = multer({
  dest: settings.uploadDir,
  limits: {
    fileSize: settings.maxUploadMb * 1024 * 1024,
  },
});

// Every route below this point already requires a signed-in Firebase user
// (see server.js) — that's "not anonymous", not "is an admin". Managing
// the built-in preset catalog is a separate, higher privilege: gate it
// behind a shared secret rather than building out real per-user roles for
// what's currently a single-operator catalog. 501s (not 403s) when unset
// so it reads as "not configured" rather than "you're not allowed".
function requireAdminKey(req, res, next) {
  if (!settings.adminApiKey) {
    return res.status(501).json({ detail: "Admin preset management isn't configured — set ADMIN_API_KEY." });
  }
  if (req.headers["x-admin-key"] !== settings.adminApiKey) {
    return res.status(403).json({ detail: "Invalid admin key" });
  }
  return next();
}

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

router.post("/profile", async (req, res) => {
  try {
    const saved = await saveProfile(req.user.uid, req.body || {});
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to save profile" });
  }
});

router.get("/profile", async (req, res) => {
  try {
    const profile = await getProfile(req.user.uid);
    return res.json(profile);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load profile" });
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const jobs = await listJobs(req.user.uid);
    return res.json(jobs);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load job history" });
  }
});

// Wipes everything this app stored in Firestore for the caller (profile,
// Saved Artists, job history) — NOT the Firebase Auth account itself, see
// deleteAllUserData's comment. The frontend calls this first, then deletes
// the Auth account client-side (the only place that can re-authenticate
// and delete a user's own account), then signs out.
router.delete("/account", async (req, res) => {
  try {
    await deleteAllUserData(req.user.uid);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to delete account data" });
  }
});

// Invalidates every refresh token Firebase has issued for this account —
// every other signed-in browser/device (and the calling one, once its
// current ID token expires or the frontend force-signs-out right after
// calling this) stops being accepted. requireAuth's checkRevoked:true is
// what actually enforces this at request time; this route just triggers it.
router.post("/account/sign-out-everywhere", async (req, res) => {
  try {
    await getAuth().revokeRefreshTokens(req.user.uid);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to revoke sessions" });
  }
});

router.get("/billing/status", async (req, res) => {
  try {
    const status = await getSubscriptionStatus(req.user.uid);
    return res.json(status);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load billing status" });
  }
});

// { subscription, credits } in one call — what the frontend's pricing/
// paywall UI actually needs to decide what to show.
router.get("/billing/entitlements", async (req, res) => {
  try {
    const [subscription, credits, freeQuota] = await Promise.all([
      getSubscriptionStatus(req.user.uid),
      getCredits(req.user.uid),
      getFreeQuotaStatus(req.user.uid),
    ]);
    return res.json({ subscription, credits, freeQuota });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load entitlements" });
  }
});

// body.item is one of: subscription | master_standard | master_professional | chords | stem_addon
const CHECKOUT_ITEM_TO_PRODUCT_KEY = {
  subscription: "subscription",
  master_standard: "masterStandard",
  master_professional: "masterProfessional",
  chords: "chords",
  stem_addon: "stemAddon",
};

router.post("/billing/checkout", async (req, res) => {
  const productKey = CHECKOUT_ITEM_TO_PRODUCT_KEY[req.body?.item];
  if (!productKey) {
    return res.status(400).json({ detail: `Unknown item "${req.body?.item}"` });
  }
  try {
    const url = await createCheckoutUrl(req.user.uid, req.user.email, productKey, req.body?.success_url);
    return res.json({ url });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to start checkout" });
  }
});

router.post("/billing/portal", async (req, res) => {
  try {
    const url = await createPortalUrl(req.user.uid);
    return res.json({ url });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to open billing portal" });
  }
});

router.get("/mix-presets", async (req, res) => {
  res.json(await listMixPresets(req.user?.uid));
});

router.post("/import-preset", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  try {
    const jsonText = fs.readFileSync(req.file.path, "utf-8");
    const preset = await importCustomPreset(jsonText, req.body.display_name || null, req.user.uid);
    return res.json(preset);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Preset import failed" });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

router.delete("/custom-presets/:name", async (req, res) => {
  const removed = await deleteCustomPreset(req.params.name, req.user.uid);
  if (!removed) {
    return res.status(404).json({ detail: "Custom preset not found" });
  }
  return res.json({ ok: true });
});

// Manage the built-in/curated preset catalog (the ones every user sees) —
// admin-only, see requireAdminKey above. Body shape matches an entry of
// mixing_presets.json: { display_name, genre, style, tags, tweaks,
// use_stem_separation, output_format, processing?, quality_control?, output? }.
router.put("/admin/presets/:slug", requireAdminKey, async (req, res) => {
  try {
    const saved = await upsertBuiltInPreset(req.params.slug, req.body || {});
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to save preset" });
  }
});

router.delete("/admin/presets/:slug", requireAdminKey, async (req, res) => {
  const removed = await deleteBuiltInPreset(req.params.slug);
  if (!removed) {
    return res.status(404).json({ detail: "Preset not found" });
  }
  return res.json({ ok: true });
});

const masterUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "reference_file", maxCount: 1 },
]);

const CREDIT_PRICE_LABEL = {
  masterStandard: "a Standard master credit (€2.99)",
  masterProfessional: "a Professional master credit (€4.99)",
  stemAddon: "the stem separation add-on (€1.99)",
  chords: "a chord detection credit (€1.49)",
};

// 30s is enough to hear what the engine does to a track without it being a
// usable file — Standard engine only, never Professional, never stems (the
// input truncation happens before the file ever reaches the DSP pipeline,
// so a preview also costs a fraction of the compute a full render would).
const PREVIEW_SECONDS = 30;

async function truncateToPreview(inputPath, workDir) {
  const outputPath = path.join(workDir, `${path.basename(inputPath)}_preview.wav`);
  try {
    await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-t", String(PREVIEW_SECONDS), outputPath]);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("ffmpeg is not installed or not on PATH for this server process — install it and restart.");
    }
    throw error;
  }
  return outputPath;
}

router.post("/master", masterUpload, async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) {
    return res.status(400).json({ detail: "file is required" });
  }
  const referenceFile = req.files?.reference_file?.[0] || null;
  const preview = req.body.preview === "true";
  const tier = !preview && req.body.tier === "professional" ? "professional" : "standard";
  const useStemSeparation = !preview && req.body.use_stem_separation === "true";

  // Master Audio is a paid feature, with one free allowance: 3 full-length
  // Standard masters per calendar month, no stem separation (Professional
  // and stems are never free, only ever a credit or the subscription).
  // Credit checks are only enforced once the relevant Polar product is
  // actually configured, so local dev / pre-launch stays open rather than
  // every render 402ing before you've set an env var. Both free quota and
  // credits are checked (not consumed) here, and only actually spent
  // after a successful render below — a render that fails midway
  // shouldn't cost the user anything.
  const creditKey = tier === "professional" ? "masterProfessional" : "masterStandard";
  const needsStemCredit = useStemSeparation && Boolean(settings.polarProducts.stemAddon);
  const canUseFreeQuota = tier === "standard" && !needsStemCredit;
  let mustConsumeCredits = false;
  let mustConsumeFreeQuota = false;

  if (!preview) {
    const subscribed = await isSubscriptionActive(req.user.uid).catch(() => false);
    if (!subscribed) {
      if (canUseFreeQuota) {
        const quota = await getFreeQuotaStatus(req.user.uid);
        if (quota.remaining > 0) mustConsumeFreeQuota = true;
      }
      if (!mustConsumeFreeQuota && (settings.polarProducts[creditKey] || needsStemCredit)) {
        const credits = await getCredits(req.user.uid);
        const missing = [];
        if (settings.polarProducts[creditKey] && credits[creditKey] < 1) missing.push(CREDIT_PRICE_LABEL[creditKey]);
        if (needsStemCredit && credits.stemAddon < 1) missing.push(CREDIT_PRICE_LABEL.stemAddon);
        if (missing.length) {
          const quotaNote = canUseFreeQuota ? " Your 3 free Standard masters this month are used up — they reset next month." : "";
          return res.status(402).json({
            detail: `This needs ${missing.join(" and ")}, or an active All-Access subscription (€19/mo).${quotaNote} Buy in Settings → Billing.`,
          });
        }
        mustConsumeCredits = true;
      }
    }
  }

  try {
    const tags = JSON.parse(req.body.tags || "[]");
    const tweaks = JSON.parse(req.body.tweaks || "{}");
    // Pro Mastering's manual parameter panel — never on preview, which is
    // always the cheap Standard/adaptive path (see PREVIEW_SECONDS above).
    const processing = !preview && req.body.processing ? JSON.parse(req.body.processing) : null;

    let masterFile = file;
    if (preview) {
      const previewPath = await truncateToPreview(file.path, settings.uploadDir);
      masterFile = { ...file, path: previewPath };
    }

    const result = await processMastering({
      file: masterFile,
      referenceFile: preview ? null : referenceFile,
      uid: req.user.uid,
      fields: {
        genre: req.body.genre || null,
        style: req.body.style || "modern",
        tags,
        tweaks,
        use_stem_separation: useStemSeparation,
        output_format: req.body.output_format || "wav",
        mix_preset: preview ? null : req.body.mix_preset || null,
        tier,
        processing,
      },
    });

    if (preview) fs.unlink(masterFile.path, () => {});

    // Only spent now that the render actually succeeded. If this
    // somehow fails (Firestore hiccup), the user already has their file —
    // log it rather than fail a response that already succeeded; worst
    // case is one unbilled render, not a broken purchase.
    if (mustConsumeFreeQuota) {
      consumeFreeQuota(req.user.uid).catch((error) =>
        console.error("Failed to consume free quota after successful render:", error.message)
      );
    } else if (mustConsumeCredits) {
      Promise.all([
        settings.polarProducts[creditKey] ? consumeCredit(req.user.uid, creditKey) : null,
        needsStemCredit ? consumeCredit(req.user.uid, "stemAddon") : null,
      ]).catch((error) => console.error("Failed to consume credit after successful render:", error.message));
    }

    // Recorded regardless of preview — ownsJob() needs this to exist for
    // the download routes to work at all, even for a preview. listJobs()
    // filters preview:true back out, so "My Masters" stays uncluttered.
    // Best-effort — a Firestore hiccup here shouldn't fail a render that
    // already succeeded and already has a real file waiting for the user.
    recordJob(req.user.uid, {
      job_id: result.job_id,
      genre: req.body.genre || null,
      style: req.body.style || "modern",
      tier,
      output_format: req.body.output_format || "wav",
      original_filename: file.originalname,
      before_lufs: result.before_lufs,
      after_lufs: result.after_lufs,
      preview,
    }).catch((error) => console.error("Failed to record job history:", error.message));

    return res.json({ ...result, preview });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Mastering failed" });
  }
});

router.post("/analyze-chords", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  // Chord detection is fully paid — no free preview (unlike Master Audio).
  // Same "only gate once configured" escape hatch as everywhere else.
  // Checked (not consumed) before running — only spent after success, same
  // reasoning as /master: a failed analysis shouldn't cost the user.
  let mustConsumeChordsCredit = false;
  if (settings.polarProducts.chords) {
    const subscribed = await isSubscriptionActive(req.user.uid).catch(() => false);
    if (!subscribed) {
      const credits = await getCredits(req.user.uid);
      if (credits.chords < 1) {
        return res.status(402).json({
          detail: `Show Chords needs ${CREDIT_PRICE_LABEL.chords}, or an active All-Access subscription (€19/mo). Buy in Settings → Billing.`,
        });
      }
      mustConsumeChordsCredit = true;
    }
  }
  try {
    const result = await analyzeChords(req.file);
    if (mustConsumeChordsCredit) {
      consumeCredit(req.user.uid, "chords").catch((error) =>
        console.error("Failed to consume chords credit after successful analysis:", error.message)
      );
    }
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
  if (!(await ownsJob(req.user.uid, jobId))) {
    return res.status(404).json({ detail: "Job not found" });
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

// All three below serve a specific user's audio — job_id alone isn't
// enough to authorize access (a signed-in user, but any signed-in user,
// could otherwise download anyone else's file by guessing/reusing a
// job_id). ownsJob() scopes the lookup to the requester's own Firestore
// subcollection, so this also covers previews (recorded with preview:true,
// see recordJob) not just full purchased renders.
router.get("/download-codec-preview/:jobId/:codec", async (req, res) => {
  const { jobId, codec } = req.params;
  if (!(await ownsJob(req.user.uid, jobId))) {
    return res.status(404).json({ detail: "Codec preview not found — run /codec-preview first" });
  }
  return proxyFromPython(`/download-codec-preview/${jobId}/${codec}`, res, "Codec preview not found — run /codec-preview first");
});

router.get("/download/:jobId.:ext", async (req, res) => {
  const { jobId, ext } = req.params;
  if (!(await ownsJob(req.user.uid, jobId))) {
    return res.status(404).json({ detail: "File not found" });
  }
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

router.get("/original/:jobId", async (req, res) => {
  if (!(await ownsJob(req.user.uid, req.params.jobId))) {
    return res.status(404).json({ detail: "Original not found" });
  }
  const prefix = `${req.params.jobId}_input`;
  const localMatches = fs.readdirSync(settings.uploadDir).filter((name) => name.startsWith(prefix));
  if (localMatches.length) {
    return res.sendFile(path.join(settings.uploadDir, localMatches[0]));
  }
  return proxyFromPython(`/original/${req.params.jobId}`, res, "Original not found");
});

export default router;
