import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import express from "express";
import multer from "multer";

import { GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { processMastering, execFileAsync, deleteJobFiles } from "../services/masteringService.js";
import { analyzeChords, previewCodec } from "../services/chordCleanService.js";
import { listMixPresets } from "../services/presetsService.js";
import { importCustomPreset, deleteCustomPreset } from "../services/customPresetsService.js";
import { upsertBuiltInPreset, deleteBuiltInPreset } from "../services/builtinPresetsService.js";
import { saveProfile, getProfile, deleteAllUserData } from "../services/profileService.js";
import { recordJob, listJobs, ownsJob, getJob, deleteJob } from "../services/jobsService.js";
import { createCheckoutUrl, createPortalUrl, getSubscriptionStatus, getPlan } from "../services/polarService.js";
import { getMasterQuotaStatus, consumeMasterQuota, PLAN_MASTER_LIMITS } from "../services/entitlementsService.js";
import { getAuth } from "../config/firebase.js";
import { mintDownloadToken, mintShareToken, verifyShareToken } from "../services/downloadTokenService.js";

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

// Mints the short-lived ?dl= token that download/original/codec-preview
// links need (see downloadTokenService.js / server.js's auth gate) — this
// route itself is still behind normal Bearer-header auth, it's the one
// place that trades a header for a URL-embeddable token.
router.get("/download-token", (req, res) => {
  res.json({ token: mintDownloadToken(req.user.uid) });
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

// Deletes a job's actual files (not just the Firestore record) right now,
// rather than waiting on the automatic 48h sweep — the "Delete" button in
// My Masters. Also invalidates any share link for this job implicitly:
// the link's token still verifies fine, but the file it points to is gone,
// so /shared/:jobId 404s the moment this finishes — no separate
// revocation list needed.
router.delete("/jobs/:jobId", async (req, res) => {
  if (!(await ownsJob(req.user.uid, req.params.jobId))) {
    return res.status(404).json({ detail: "Job not found" });
  }
  await deleteJobFiles(req.params.jobId);
  await deleteJob(req.user.uid, req.params.jobId);
  return res.json({ ok: true });
});

// Mints a public, no-login-required link to exactly one job's mastered
// file — "the share button," scoped tighter than a WeTransfer link in one
// way (only ever this one file, never a folder) and looser in another
// (no separate delete-the-link step; it just stops working once the file
// itself expires or is deleted, same as everything else in this app's
// 48h-retention model). expiresAt is capped at the job's own expiry so a
// share link can never promise access longer than the file will exist.
// All-Access only — same reasoning as chord detection, a real plan
// feature, not something Free/Studio can reach around a purchase.
router.post("/jobs/:jobId/share", async (req, res) => {
  const plan = await getPlan(req.user.uid).catch(() => "free");
  if (plan !== "pro") {
    return res.status(402).json({ detail: "Share links are an All-Access feature (€19.99/mo). Upgrade in Settings → Billing." });
  }
  const job = await getJob(req.user.uid, req.params.jobId);
  if (!job) {
    return res.status(404).json({ detail: "Job not found" });
  }
  const expiresAt = job.expires_at?.toDate ? job.expires_at.toDate() : new Date(job.expires_at);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return res.status(410).json({ detail: "This master has already expired and can't be shared anymore." });
  }
  const token = mintShareToken(req.user.uid, req.params.jobId, expiresAt);
  // Points at the frontend's own simple download page (SharedMasterClient),
  // not straight at this API — a plain file response has no branding, no
  // "invalid/expired" explanation, nothing but a bare download. The page
  // calls GET /shared/:jobId/info with the same token to render itself,
  // then links to the actual file (this API's /shared/:jobId) to download it.
  const base = settings.frontendOrigin || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/shared/${req.params.jobId}?token=${encodeURIComponent(token)}`;
  return res.json({ url, expires_at: expiresAt.toISOString() });
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

// { plan, subscription, masterQuota } in one call — the single source of
// truth every button/paywall in the frontend reads from (see
// frontend/src/store/entitlementsStore.js) instead of each component
// fetching and caching its own copy, which is what used to let one button
// show "unlocked" while another still thought the user was on Free.
router.get("/billing/entitlements", async (req, res) => {
  try {
    const plan = await getPlan(req.user.uid);
    const [subscription, masterQuota] = await Promise.all([
      getSubscriptionStatus(req.user.uid),
      getMasterQuotaStatus(req.user.uid, plan),
    ]);
    return res.json({ plan, subscription, masterQuota });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load entitlements" });
  }
});

// body.item is one of: plan_studio | plan_pro — no à la carte items left,
// see settings.js's polarProducts comment.
const CHECKOUT_ITEM_TO_PRODUCT_KEY = {
  plan_studio: "planStudio",
  plan_pro: "planPro",
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

  // Two plans + Free (see PRICING.md): Free (3 Standard masters/month, no
  // Professional tier, no stems, no chords), Studio (50 masters/month,
  // Standard + Professional, stems included, no chords), All-Access (250
  // masters/month, everything including unlimited chord detection — see
  // /analyze-chords below). Professional tier and stem separation are
  // Studio+ only, with no one-time-purchase bypass — every paid feature is
  // plan-gated, no à la carte items left to buy around a plan's limits.
  // Every plan (including paid ones) has a monthly master quota now, not
  // just Free — checked (not consumed) here and only actually spent after
  // a successful render below, so a render that fails midway never costs
  // the user a slot.
  let mustConsumeQuota = false;
  let quotaLimit = PLAN_MASTER_LIMITS.free;

  if (!preview) {
    const plan = await getPlan(req.user.uid).catch(() => "free");
    const planUnlocked = plan === "studio" || plan === "pro";
    quotaLimit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;

    if (tier === "professional" && !planUnlocked) {
      return res.status(402).json({
        detail: "Professional mastering needs the Studio plan or higher (€9.99/mo). Upgrade in Settings → Billing.",
      });
    }
    if (useStemSeparation && !planUnlocked) {
      return res.status(402).json({
        detail: "Stem separation needs the Studio plan or higher (€9.99/mo). Upgrade in Settings → Billing.",
      });
    }

    const quota = await getMasterQuotaStatus(req.user.uid, plan);
    if (quota.remaining <= 0) {
      const upsell = plan === "free" ? " Upgrade to Studio (€9.99/mo) for 50/month." : plan === "studio" ? " Upgrade to All-Access (€19.99/mo) for 250/month." : "";
      return res.status(402).json({
        detail: `You've used your ${quotaLimit} masters this month — they reset next month.${upsell} Manage in Settings → Billing.`,
      });
    }
    mustConsumeQuota = true;
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

    // Only spent now that the render actually succeeded. Awaited (not
    // fire-and-forget) — the frontend re-checks remaining quota the
    // instant this response lands (see AppClient.jsx's refreshEntitlements
    // after a real master), so the Firestore write has to have actually
    // landed by then or that re-check shows the stale, pre-deduction count.
    // Still doesn't fail the response on error — the user already has
    // their file; a Firestore hiccup here is one unbilled render, logged,
    // not a broken master.
    if (mustConsumeQuota) {
      try {
        await consumeMasterQuota(req.user.uid, quotaLimit);
      } catch (error) {
        console.error("Failed to consume master quota after successful render:", error.message);
      }
    }

    // Recorded regardless of preview — ownsJob() needs this to exist for
    // the download routes to work at all, even for a preview. listJobs()
    // filters preview:true back out, so "My Masters" stays uncluttered.
    const recordJobPromise = recordJob(req.user.uid, {
      job_id: result.job_id,
      genre: req.body.genre || null,
      style: req.body.style || "modern",
      tier,
      output_format: req.body.output_format || "wav",
      original_filename: file.originalname,
      before_lufs: result.before_lufs,
      after_lufs: result.after_lufs,
      preview,
    });
    if (preview) {
      // Best-effort — a Firestore hiccup here shouldn't fail a preview
      // response that already succeeded and already has a real file
      // waiting for the user.
      recordJobPromise.catch((error) => console.error("Failed to record job history:", error.message));
    } else {
      // Awaited for a real master — the frontend auto-navigates straight
      // to My Masters on this response (see AppClient.jsx), so the
      // Firestore write needs to have actually landed by the time that
      // happens, not still be in flight. Still best-effort in the sense
      // that a failure here doesn't fail the response — the render
      // already succeeded and the file already exists — just logged.
      try {
        await recordJobPromise;
      } catch (error) {
        console.error("Failed to record job history:", error.message);
      }
    }

    return res.json({ ...result, preview });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Mastering failed" });
  }
});

router.post("/analyze-chords", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  // Chord detection is an All-Access-only feature now — not purchasable
  // separately, and not part of Studio (Studio's promise is "master +
  // stems", never chords). No credit fallback, no "not configured yet"
  // escape hatch: this is a pure plan check.
  const plan = await getPlan(req.user.uid).catch(() => "free");
  if (plan !== "pro") {
    return res.status(402).json({
      detail: "Chord detection is included with the All-Access plan (€19.99/mo). Upgrade in Settings → Billing.",
    });
  }
  try {
    const result = await analyzeChords(req.file);
    return res.json(result);
  } catch (error) {
    const detail = error?.stderr || error?.message || "Chord detection failed";
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
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) res.setHeader("Content-Length", contentLength);

  // Streamed straight through, not buffered — a mastered WAV can be tens
  // of MB, and the previous Buffer.from(await upstream.arrayBuffer())
  // waited for the ENTIRE file from Python before sending a single byte
  // to the browser, then held the whole thing in memory on top of that.
  // This pipes bytes to the client as they arrive from Python instead,
  // so the two transfers overlap instead of running fully sequentially —
  // the actual cause of "the download takes forever."
  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on("error", (error) => {
    console.error("Error streaming file from Python service:", error.message);
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });
  return nodeStream.pipe(res);
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

// Public metadata for the frontend's simple /shared/:jobId page — just
// enough to render "here's the file, want it?" without exposing anything
// else about the account that shared it. Same public/token-only auth as
// the file route right below.
router.get("/shared/:jobId/info", async (req, res) => {
  const claim = verifyShareToken(req.query.token);
  if (!claim || claim.jobId !== req.params.jobId) {
    return res.status(404).json({ detail: "This link is invalid or has expired." });
  }
  const job = await getJob(claim.uid, req.params.jobId);
  if (!job) {
    return res.status(404).json({ detail: "This link is invalid or has expired." });
  }
  const ext = job.output_format || "wav";
  return res.json({
    filename: job.original_filename || `mastered_${req.params.jobId}.${ext}`,
    genre: job.genre || null,
    tier: job.tier || null,
    before_lufs: job.before_lufs ?? null,
    after_lufs: job.after_lufs ?? null,
    expires_at: job.expires_at?.toDate ? job.expires_at.toDate().toISOString() : job.expires_at || null,
    download_url: `${req.protocol}://${req.get("host")}/shared/${req.params.jobId}?token=${encodeURIComponent(req.query.token)}`,
  });
});

// Public — deliberately NOT behind requireAuth (see server.js's auth gate,
// which exempts /shared/ the same way it exempts /health and /webhooks/).
// Authorization here is the ?token= itself, not a signed-in session: this
// is the link a user hands to someone with no account at all. verifyShareToken
// both checks the signature/expiry AND that the token's embedded jobId
// matches this URL's :jobId — a token can't be replayed against a
// different job's share link.
router.get("/shared/:jobId", async (req, res) => {
  const claim = verifyShareToken(req.query.token);
  if (!claim || claim.jobId !== req.params.jobId) {
    return res.status(404).json({ detail: "This link is invalid or has expired." });
  }
  const job = await getJob(claim.uid, req.params.jobId);
  if (!job) {
    return res.status(404).json({ detail: "This link is invalid or has expired." });
  }
  const ext = job.output_format || "wav";
  const localPath = path.join(settings.outputDir, `${req.params.jobId}_mastered.${ext}`);
  if (fs.existsSync(localPath)) {
    return res.download(localPath, `mastered_${req.params.jobId}.${ext}`);
  }
  return proxyFromPython(`/download/${req.params.jobId}.${ext}`, res, "This link is invalid or has expired.");
});

export default router;
