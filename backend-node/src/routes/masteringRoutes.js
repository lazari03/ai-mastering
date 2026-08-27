import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";

import express from "express";
import multer from "multer";

import { GENRES, STYLES, TAGS, CATEGORIES, FLAVOURS_BY_CATEGORY, AUDIO_DECODE_EXTS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { processMastering, execFileAsync, deleteJobFiles, postMultipartToPython } from "../services/masteringService.js";
import { analyzeChords, previewCodec } from "../services/chordCleanService.js";
import { listMixPresets } from "../services/presetsService.js";
import { importCustomPreset, deleteCustomPreset } from "../services/customPresetsService.js";
import { upsertBuiltInPreset, deleteBuiltInPreset } from "../services/builtinPresetsService.js";
import { saveProfile, getProfile, deleteAllUserData } from "../services/profileService.js";
import { recordJob, listJobs, ownsJob, getJob, getJobDetail, deleteJob } from "../services/jobsService.js";
import {
  createCheckoutUrl,
  createPortalUrl,
  getSubscriptionStatus,
  getPlan,
  changeSubscriptionPlan,
  getChordSubscriptionActive,
} from "../services/polarService.js";
import {
  getMasterQuotaStatus,
  consumeMasterQuota,
  PLAN_MASTER_LIMITS,
  getExtraCreditCount,
  consumeExtraCredit,
  getChordQuotaStatus,
  consumeChordTrial,
  getExtraChordCreditCount,
  consumeExtraChordCredit,
  FREE_CHORD_LIMIT,
  getStemQuotaStatus,
  consumeStemQuota,
  getExtraStemCreditCount,
  consumeExtraStemCredit,
  STEM_MONTHLY_LIMIT,
} from "../services/entitlementsService.js";
import { isEmailDeliverable } from "../services/emailValidationService.js";
import { subscribeToNewsletter } from "../services/newsletterService.js";
import { getAuth } from "../config/firebase.js";
import { expensiveLimiter } from "../middleware/rateLimit.js";
import { mintDownloadToken, mintShareToken, verifyShareToken } from "../services/downloadTokenService.js";

const router = express.Router();

// Defense in depth, not the real protection — ffmpeg/soundfile already
// reject anything that isn't actually decodable audio, so a mislabeled
// file fails harmlessly downstream either way. This just avoids handing
// something obviously wrong (an executable, an HTML file, an image) into
// that pipeline at all, rejecting by extension/mimetype before it's even
// written to disk.
const ALLOWED_UPLOAD_EXTS = new Set([".wav", ".aiff", ".aif", ".flac", ...AUDIO_DECODE_EXTS]);
function audioFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const looksLikeAudio = file.mimetype?.startsWith("audio/") || file.mimetype?.startsWith("video/");
  if (ALLOWED_UPLOAD_EXTS.has(ext) || looksLikeAudio) return cb(null, true);
  cb(new Error(`Unsupported file type "${ext || file.mimetype || "unknown"}" — upload an audio file.`));
}

const upload = multer({
  dest: settings.uploadDir,
  limits: {
    fileSize: settings.maxUploadMb * 1024 * 1024,
  },
  fileFilter: audioFileFilter,
});

// Preset imports are JSON, not audio — reusing `upload` here would reject
// every real preset file through the same filter meant for /master and
// /analyze-chords. Same size cap, no audio-only filter.
function presetFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".json" || file.mimetype === "application/json") return cb(null, true);
  cb(new Error(`Unsupported file type "${ext || file.mimetype || "unknown"}" — upload a preset .json file.`));
}
const uploadPresetJson = multer({
  dest: settings.uploadDir,
  limits: {
    fileSize: 1 * 1024 * 1024, // presets are tiny; 1MB is generous
  },
  fileFilter: presetFileFilter,
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
  const provided = Buffer.from(String(req.headers["x-admin-key"] || ""));
  const expected = Buffer.from(settings.adminApiKey);
  // Constant-time compare, same discipline as the download/share tokens
  // (downloadTokenService.js) — a plain !== leaks timing information about
  // how many leading characters matched, which matters more here than it
  // sounds given this key never rotates on its own.
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(403).json({ detail: "Invalid admin key" });
  }
  return next();
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", runtime: "node" });
});

// Public, no auth — checked *during* signup, before a Firebase account
// exists yet (see server.js's auth gate). Catches an undeliverable email
// (fake domain, typo'd TLD) before an account is even created, rather
// than only surfacing the problem later at Polar checkout.
router.post("/validate-email", async (req, res) => {
  const deliverable = await isEmailDeliverable(req.body?.email);
  return res.json({ deliverable });
});

// Public, no auth — the newsletter widget/page (frontend) is meant to
// work for an anonymous visitor, not just a signed-in user. Same
// deliverability check as signup so the subscriber list doesn't fill up
// with typo'd/fake addresses. `source` is just a free-text tag (e.g.
// "footer", "newsletter-page") for telling signup channels apart later,
// never trusted for anything security-sensitive.
router.post("/newsletter/subscribe", async (req, res) => {
  const email = req.body?.email;
  const deliverable = await isEmailDeliverable(email).catch(() => false);
  if (!deliverable) {
    return res.status(400).json({ detail: "That email address doesn't look deliverable — double check it." });
  }
  try {
    const { discountCode, alreadySubscribed } = await subscribeToNewsletter(email, req.body?.source);
    return res.json({ discountCode, alreadySubscribed });
  } catch (error) {
    console.error("Newsletter subscribe failed:", error.message);
    return res.status(500).json({ detail: "Couldn't save your subscription — try again in a moment." });
  }
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

router.get("/categories", (_req, res) => {
  res.json({ categories: CATEGORIES, flavours: FLAVOURS_BY_CATEGORY });
});

router.post("/profile", async (req, res) => {
  try {
    const saved = await saveProfile(req.user.uid, req.body || {}, req.user.email);
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

// Backs the dedicated result page (/app?job=:jobId) — lets a finished
// master be reloaded on refresh, or opened from My Masters, instead of
// only ever existing in the in-memory result the moment a render
// finishes. requireAuth (server.js's global gate) has already confirmed
// who's asking by the time this runs; getJob() itself is scoped to
// req.user.uid's own jobs subcollection, so it structurally cannot return
// another user's job no matter what jobId is guessed — same ownership
// guarantee ownsJob() gives the download/original/delete routes, just
// via the lookup path itself rather than a separate check. 404 either
// way (missing vs. someone else's) so existence isn't leaked.
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const job = await getJobDetail(req.user.uid, req.params.jobId);
    if (!job) {
      return res.status(404).json({ detail: "Job not found" });
    }
    // Files (not the Firestore record) are swept 48h after creation — a
    // record can briefly outlive its files (see jobsService.js), so this
    // tells the frontend not to try building a player/download link for
    // one that's already past its window, rather than surfacing a raw
    // download 404 mid-page.
    const expired = job.expires_at ? new Date(job.expires_at).getTime() <= Date.now() : false;
    return res.json({ ...job, expired });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load job" });
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
    const [subscription, masterQuota, extraCredits, chordQuota, extraChordCredits, chordSubscriptionActive, stemQuota, extraStemCredits] =
      await Promise.all([
        getSubscriptionStatus(req.user.uid),
        getMasterQuotaStatus(req.user.uid, plan),
        getExtraCreditCount(req.user.uid),
        getChordQuotaStatus(req.user.uid),
        getExtraChordCreditCount(req.user.uid),
        getChordSubscriptionActive(req.user.uid),
        getStemQuotaStatus(req.user.uid),
        getExtraStemCreditCount(req.user.uid),
      ]);
    return res.json({
      plan,
      subscription,
      masterQuota,
      extraCredits,
      chordQuota,
      extraChordCredits,
      chordSubscriptionActive,
      stemQuota,
      extraStemCredits,
    });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to load entitlements" });
  }
});

// body.item is one of: plan_studio | plan_pro | chords_monthly |
// single_master | chord_detection | stem_separation. The first three are
// subscriptions (chords_monthly is standalone — never routed through
// changeSubscriptionPlan, see /billing/checkout below); the last three
// are one-time purchases — low-commitment top-ups for someone who just
// needs this one track mastered/analyzed/separated, not a recurring plan.
const CHECKOUT_ITEM_TO_PRODUCT_KEY = {
  plan_studio: "planStudio",
  plan_pro: "planPro",
  chords_monthly: "chordsMonthly",
  single_master: "singleMaster",
  chord_detection: "chordDetection",
  stem_separation: "stemSeparation",
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

// Switching plan while already subscribed (Studio <-> All-Access) — the
// frontend calls this instead of /billing/checkout once someone's already
// on a paid plan, so a plan change modifies the existing Polar
// subscription (see changeSubscriptionPlan) instead of starting a second,
// independent one that could leave the old subscription still billing in
// parallel. No redirect URL in the response — this takes effect
// immediately, there's no checkout page to send the user to.
router.post("/billing/change-plan", async (req, res) => {
  const productKey = CHECKOUT_ITEM_TO_PRODUCT_KEY[req.body?.item];
  if (!productKey) {
    return res.status(400).json({ detail: `Unknown item "${req.body?.item}"` });
  }
  try {
    const result = await changeSubscriptionPlan(req.user.uid, productKey);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ detail: error?.message || "Failed to change plan" });
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

router.post("/import-preset", uploadPresetJson.single("file"), async (req, res) => {
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

// Live "professional controls" preview — lets the Master tab show real,
// per-track adaptive-engine values (EQ band gains, compression, target
// loudness) as the user browses genre/style/category/flavour/tweaks,
// instead of a manual panel that never reflected those choices. Only
// meaningful with the adaptive Python engine (see /master below for the
// same guard) — the ffmpeg fallback has no per-genre parameter model to
// preview at all.
function requireAdaptiveEngine(req, res, next) {
  if (settings.masteringEngine !== "adaptive_python") {
    return res.status(501).json({ detail: "Live parameter preview needs the adaptive mastering engine, which isn't configured on this server." });
  }
  return next();
}

router.post("/analyze", expensiveLimiter, requireAdaptiveEngine, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }
  try {
    const result = await postMultipartToPython("/analyze", {
      files: { file: { path: req.file.path, filename: req.file.originalname || "input.wav" } },
    });
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ detail: error?.message || "Analysis failed" });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// upload.none(): the frontend sends this as multipart/form-data (see
// masteringDomain.js's previewParams(), which builds a FormData — same as
// every other call in that file), but this route had no multipart-parsing
// middleware at all. express.json()/urlencoded() (server.js's global body
// parsers) only understand application/json and
// application/x-www-form-urlencoded — neither parses multipart bodies, so
// req.body was always {} here and every single call 400'd with "analysis
// and genre are required", regardless of what was actually selected. This
// is why Pro Master's knobs never updated from genre/style/objective/tag
// chips: refreshPreviewParams() always failed silently upstream in the
// store. upload.none() parses the multipart fields into req.body without
// expecting any file part (there isn't one here).
router.post("/preview-params", requireAdaptiveEngine, upload.none(), async (req, res) => {
  const { analysis, genre, style, tags, tweaks, category, flavour } = req.body || {};
  if (!analysis || !genre) {
    return res.status(400).json({ detail: "analysis and genre are required" });
  }
  try {
    const result = await postMultipartToPython("/preview-params", {
      fields: {
        analysis,
        genre,
        style: style || "modern",
        tags: tags || "[]",
        tweaks: tweaks || "{}",
        category: category || null,
        flavour: flavour || null,
      },
    });
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ detail: error?.message || "Preview computation failed" });
  }
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

router.post("/master", expensiveLimiter, masterUpload, async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) {
    return res.status(400).json({ detail: "file is required" });
  }
  const referenceFile = req.files?.reference_file?.[0] || null;
  const preview = req.body.preview === "true";
  const tier = !preview && req.body.tier === "professional" ? "professional" : "standard";
  const useStemSeparation = !preview && req.body.use_stem_separation === "true";

  // Two plans + Free (see PRICING.md): Free (3 Standard masters TOTAL —
  // a one-time trial, not a monthly allowance, no Professional tier, no
  // stems, no chords), Studio (50 masters/month, resets monthly, Standard
  // + Professional, no bundled stems, no chords), All-Access (250
  // masters/month, resets monthly, everything including unlimited chord
  // detection — see /analyze-chords below). Professional tier stays
  // strictly plan-gated (Studio+, no credit bypass) — it's compute-cheap,
  // no reason to meter it separately. Stem separation is NOT part of that
  // same bucket: it's real, disproportionate server cost (Demucs source
  // separation + multiple output files per job), so it gets its own
  // tiered gate below rather than a flat plan check. The one-time
  // "single master" purchase only ever covers the master-count limit
  // itself. For a Free user past their 3-master trial, buying single
  // masters IS the standard path forward (no more free resets); for
  // Studio/All-Access, it's what covers the gap between exhausting this
  // month's quota and next month's reset, if they don't want to wait.
  // Checked (not consumed) here and only actually spent after a
  // successful render below, so a render that fails midway never costs
  // the user a slot or a credit.
  let mustConsumeQuota = false;
  let mustConsumeCredit = false;
  let mustConsumeStemQuota = false;
  let mustConsumeStemCredit = false;
  let quotaLimit = PLAN_MASTER_LIMITS.free;
  let plan = "free";

  if (!preview) {
    plan = await getPlan(req.user.uid).catch(() => "free");
    const planUnlocked = plan === "studio" || plan === "pro";
    quotaLimit = PLAN_MASTER_LIMITS[plan] ?? PLAN_MASTER_LIMITS.free;

    if (tier === "professional" && !planUnlocked) {
      return res.status(402).json({
        detail: "Professional mastering needs the Studio plan or higher (€9.99/mo). Upgrade in Settings → Billing.",
      });
    }

    if (useStemSeparation) {
      if (plan === "pro") {
        // Bounded monthly sub-limit, not "unlimited within your 250
        // masters" — see entitlementsService.js's STEM_MONTHLY_LIMIT
        // comment for why this stays separately metered even on the top
        // plan. Fails CLOSED, same discipline as the master quota below.
        const stemQuota = await getStemQuotaStatus(req.user.uid).catch((error) => {
          console.error("getStemQuotaStatus failed, failing closed:", error.message);
          return { remaining: 0, limit: STEM_MONTHLY_LIMIT };
        });
        if (stemQuota.remaining > 0) {
          mustConsumeStemQuota = true;
        } else {
          const stemCredits = await getExtraStemCreditCount(req.user.uid).catch(() => 0);
          if (stemCredits > 0) {
            mustConsumeStemCredit = true;
          } else {
            return res.status(402).json({
              detail: `You've used your ${stemQuota.limit} stem separations this month — they reset next month. Buy an extra one (€4.99) if you don't want to wait. Manage in Settings → Billing.`,
            });
          }
        }
      } else {
        // Free/Studio get no bundled stem access at all, not even a
        // trial — this is the single most expensive operation in the
        // app. A purchased credit is the only way in, same standalone
        // pattern as Chord Detection's pay-per-use path.
        const stemCredits = await getExtraStemCreditCount(req.user.uid).catch(() => 0);
        if (stemCredits > 0) {
          mustConsumeStemCredit = true;
        } else {
          return res.status(402).json({
            detail:
              "Stem separation is an All-Access feature (€19.99/mo, 20/month included), or buy one separately for €4.99. Manage in Settings → Billing.",
          });
        }
      }
    }

    // Fails CLOSED — a Firestore hiccup here must never read as "quota
    // available." Forces the same path as a genuinely exhausted quota,
    // which correctly falls through to checking credits and then a clear
    // error, rather than a raw 500 or silently letting the render through
    // unverified.
    const quota = await getMasterQuotaStatus(req.user.uid, plan).catch((error) => {
      console.error("getMasterQuotaStatus failed, failing closed:", error.message);
      return { remaining: 0, limit: quotaLimit };
    });
    if (quota.remaining > 0) {
      mustConsumeQuota = true;
    } else {
      // Quota exhausted — fall back to a purchased single-master credit
      // before refusing outright. For Free this is the ONLY way forward
      // besides upgrading (no reset coming); for Studio/All-Access it's
      // an alternative to waiting for next month.
      const credits = await getExtraCreditCount(req.user.uid).catch(() => 0);
      if (credits > 0) {
        mustConsumeCredit = true;
      } else if (plan === "free") {
        return res.status(402).json({
          detail: `You've used your ${quotaLimit} free masters — that's a one-time trial, it doesn't renew. Buy a single master (€2.99) for just this track, or subscribe to Studio (€9.99/mo, 50/month) or All-Access (€19.99/mo, 250/month) in Settings → Billing.`,
        });
      } else {
        const upsellPlan = plan === "studio" ? "All-Access (€19.99/mo) for 250/month" : null;
        const upsell = upsellPlan ? ` Upgrade to ${upsellPlan}, or` : " Or";
        return res.status(402).json({
          detail: `You've used your ${quotaLimit} masters this month — they reset next month.${upsell} buy a single master (€2.99) if you don't want to wait. Manage in Settings → Billing.`,
        });
      }
    }
  }

  try {
    const tags = JSON.parse(req.body.tags || "[]");
    const tweaks = JSON.parse(req.body.tweaks || "{}");
    // Pro Mastering's manual parameter panel — never on preview, which is
    // always the cheap Standard/adaptive path (see PREVIEW_SECONDS above).
    // Band-array lengths are capped here: the UI never generates more than
    // a handful, but nothing stops a direct API call from sending
    // thousands — each one is a real filter construction in
    // preset_dsp_engine.py, so an uncapped array is a cheap way to make
    // one request tie up a lot of DSP compute regardless of the rate limit
    // on request *count*.
    const processing = !preview && req.body.processing ? JSON.parse(req.body.processing) : null;
    if (processing) {
      const MAX_BANDS = 24;
      const tooMany =
        (processing.eq?.length || 0) > MAX_BANDS ||
        (processing.dynamic_eq?.length || 0) > MAX_BANDS ||
        (processing.stereo?.bands?.length || 0) > MAX_BANDS;
      if (tooMany) {
        return res.status(400).json({ detail: `Too many bands in one processing spec — ${MAX_BANDS} max per list.` });
      }
    }

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
        category: preview ? null : req.body.category || null,
        flavour: preview ? null : req.body.flavour || null,
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
        await consumeMasterQuota(req.user.uid, quotaLimit, plan);
      } catch (error) {
        console.error("Failed to consume master quota after successful render:", error.message);
      }
    } else if (mustConsumeCredit) {
      try {
        await consumeExtraCredit(req.user.uid);
      } catch (error) {
        console.error("Failed to consume extra master credit after successful render:", error.message);
      }
    }

    // Independent of the master quota/credit consumption above — a
    // stem-separated render spends from BOTH counters when applicable
    // (its master-count slot AND its stem sub-limit slot), not one or the
    // other, since they're two separately-metered resources.
    if (mustConsumeStemQuota) {
      try {
        await consumeStemQuota(req.user.uid);
      } catch (error) {
        console.error("Failed to consume stem quota after successful render:", error.message);
      }
    } else if (mustConsumeStemCredit) {
      try {
        await consumeExtraStemCredit(req.user.uid);
      } catch (error) {
        console.error("Failed to consume extra stem credit after successful render:", error.message);
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
      analysis_before: result.analysis_before,
      analysis_after: result.analysis_after,
      ab_gain_match: result.ab_gain_match,
      processing_applied: result.processing_applied,
      target_profile_used: result.target_profile_used,
      source_warnings: result.source_warnings,
      quality_control: result.quality_control,
    });
    if (preview) {
      // Best-effort — a Firestore hiccup here shouldn't fail a preview
      // response that already succeeded and already has a real file
      // waiting for the user.
      recordJobPromise.catch((error) => console.error("Failed to record job history:", error.message));
    } else {
      // Awaited for a real master — the frontend auto-navigates straight
      // to /app?job=:jobId on this response (see AppClient.jsx),
      // which immediately does a GET /jobs/:jobId, so the Firestore write
      // needs to have actually landed by the time that happens, not still
      // be in flight. Still best-effort in the sense
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

// Chord detection is BOTH an All-Access plan perk (unlimited, unchanged)
// AND its own standalone product for anyone else — a guitarist who wants
// chords for one song has no reason to buy a mastering subscription.
// Standalone path: FREE_CHORD_LIMIT lifetime free (never resets, same
// one-time-trial shape as the Free master quota), then pay-per-song
// credits. Entirely separate counters from mastering — buying/using one
// product never touches the other's balance. Consumed only after a
// successful analysis, same "never charge for a failure" discipline as
// /master.
router.post("/analyze-chords", expensiveLimiter, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }

  const plan = await getPlan(req.user.uid).catch(() => "free");
  // Two independent ways to be unlimited: the All-Access plan (bundled),
  // or a standalone Chords Monthly subscription (for anyone who wants
  // unlimited chords without a mastering plan at all).
  const chordSubscribed = await getChordSubscriptionActive(req.user.uid).catch((error) => {
    console.error("getChordSubscriptionActive failed, failing closed:", error.message);
    return false;
  });
  const unlimited = plan === "pro" || chordSubscribed;
  let mustConsumeTrial = false;
  let mustConsumeChordCredit = false;

  if (!unlimited) {
    // Fails CLOSED, not open — a Firestore hiccup here must never be
    // interpreted as "quota available." { remaining: 0 } forces the same
    // path as a genuinely exhausted trial, which correctly falls through
    // to checking credits and then the honest "try again" error below,
    // rather than a raw 500 or (worse) silently letting the request
    // through unverified.
    const trial = await getChordQuotaStatus(req.user.uid).catch((error) => {
      console.error("getChordQuotaStatus failed, failing closed:", error.message);
      return { remaining: 0, limit: FREE_CHORD_LIMIT };
    });
    if (trial.remaining > 0) {
      mustConsumeTrial = true;
    } else {
      const credits = await getExtraChordCreditCount(req.user.uid).catch(() => 0);
      if (credits > 0) {
        mustConsumeChordCredit = true;
      } else {
        return res.status(402).json({
          detail: `You've used your ${trial.limit} free chord detections — that's a one-time trial, it doesn't renew. Buy one for €1.49, get unlimited chord detection for €2.99/mo, or it's included with All-Access (€19.99/mo). Manage in Settings → Billing.`,
        });
      }
    }
  }

  try {
    const result = await analyzeChords(req.file);
    if (mustConsumeTrial) {
      try {
        await consumeChordTrial(req.user.uid);
      } catch (error) {
        console.error("Failed to consume chord trial after successful analysis:", error.message);
      }
    } else if (mustConsumeChordCredit) {
      try {
        await consumeExtraChordCredit(req.user.uid);
      } catch (error) {
        console.error("Failed to consume chord credit after successful analysis:", error.message);
      }
    }
    return res.json(result);
  } catch (error) {
    const detail = error?.stderr || error?.message || "Chord detection failed";
    return res.status(500).json({ detail });
  }
});

router.post("/codec-preview", expensiveLimiter, async (req, res) => {
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

// Always 16-bit PCM WAV (see mastering_service.py:_make_browser_preview) —
// a separate, browser-safe copy for <audio src> playback (SignalVisualizer,
// WebGLMasterPreview) distinct from /download's actual deliverable, which
// stays at its real bit depth. This is what fixed "mastered signal shows a
// player error while the original plays fine" — the mastered file is
// always written 24-bit, a real (if narrower) native-<audio> compat gap
// that 16-bit doesn't have.
router.get("/preview/:jobId", async (req, res) => {
  if (!(await ownsJob(req.user.uid, req.params.jobId))) {
    return res.status(404).json({ detail: "Preview not found" });
  }
  return proxyFromPython(`/preview/${req.params.jobId}`, res, "Preview not found");
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
