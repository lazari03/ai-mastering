import fs from "node:fs";

import { GENRES, STYLES, TAGS } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";
import { normalizePreset } from "./presetsService.js";

// Built-in/curated presets — the ones every user sees, as opposed to a
// user's own Saved Artists (customPresetsService.js). These now live in
// Firestore at presets/{slug}, not the mixing_presets.json file, so adding
// a new one doesn't require a code deploy — see upsertBuiltInPreset below
// and scripts/seed-presets.js for the one-time migration off the file.
//
// The local file is kept for standalone Python-side tooling
// (validate_mastering.py, the *_cli.py scripts) which read it directly and
// are unaffected by this — and doubles as a fallback here if Firestore is
// briefly unreachable or hasn't been seeded yet, so the app degrades to
// "old preset list" instead of "no presets at all".
const TWEAK_KEYS = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTweaks(raw = {}) {
  const out = {};
  for (const key of TWEAK_KEYS) {
    const val = Number(raw?.[key] ?? 0);
    out[key] = Number.isFinite(val) ? clamp(val, -1, 1) : 0;
  }
  return out;
}

function presetsCollection() {
  return getFirestore().collection("presets");
}

function readLocalFileFallback() {
  try {
    const raw = fs.readFileSync(settings.presetsFile, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed?.presets || {};
  } catch {
    return {};
  }
}

export async function listBuiltInPresets() {
  try {
    const snapshot = await presetsCollection().get();
    if (!snapshot.empty) {
      return snapshot.docs.map((doc) => normalizePreset(doc.id, doc.data(), { custom: false }));
    }
  } catch (error) {
    console.error("Firestore unreachable for built-in presets, falling back to local file:", error.message);
  }
  const fileEntries = readLocalFileFallback();
  return Object.entries(fileEntries).map(([slug, value]) => normalizePreset(slug, value, { custom: false }));
}

// Validates and writes one built-in preset, keyed by slug — an admin-only
// operation (see the ADMIN_API_KEY-gated routes in masteringRoutes.js),
// not exposed to regular signed-in users the way Saved Artists is.
export async function upsertBuiltInPreset(slug, raw) {
  if (!slug || typeof slug !== "string") {
    throw new Error("A preset slug is required");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Preset body must be a JSON object");
  }
  if (!GENRES.includes(raw.genre)) {
    throw new Error(`genre must be one of: ${GENRES.join(", ")}`);
  }
  const style = raw.style || "modern";
  if (!STYLES.includes(style)) {
    throw new Error(`style must be one of: ${STYLES.join(", ")}`);
  }
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const unknownTags = tags.filter((tag) => !TAGS.includes(tag));
  if (unknownTags.length) {
    throw new Error(`Unknown tag(s): ${unknownTags.join(", ")}`);
  }

  const record = {
    display_name: raw.display_name || slug,
    description: raw.description || "",
    genre: raw.genre,
    style,
    tags,
    tweaks: normalizeTweaks(raw.tweaks),
    use_stem_separation: Boolean(raw.use_stem_separation),
    output_format: raw.output_format === "mp3" ? "mp3" : "wav",
    processing: raw.processing || null,
    quality_control: raw.quality_control || null,
    output: raw.output || null,
  };

  await presetsCollection().doc(slug).set(record);
  return normalizePreset(slug, record, { custom: false });
}

export async function deleteBuiltInPreset(slug) {
  const ref = presetsCollection().doc(slug);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}
