// Product facts that more than one page states. Pricing lives in
// lib/pricing.js (PLANS, SINGLE_MASTER, STEM_SEPARATION); everything else a
// page might claim about limits, formats, retention and tools lives here,
// so a marketing page can't quietly contradict what the backend enforces.
//
// SOURCES OF TRUTH (backend) — change these together:
//   masters per plan ...... backend-node entitlementsService.js PLAN_MASTER_LIMITS
//   Professional engine ... masteringRoutes.js /master gate (studio, pro only)
//   stems ................. entitlementsService.js STEM_MONTHLY_LIMIT; Demucs --two-stems vocals
//   chord/key/BPM ......... masteringRoutes.js /analyze-chords (no quota)
//   retention ............. backend/app/core/config.py MASTERING_FILE_RETENTION_HOURS
//   upload size ........... backend-node settings.maxUploadMb (MAX_UPLOAD_MB)
//   codecs ................ backend/app/services/codec_preview_service.py
import { PLANS, PLAN_ORDER, SINGLE_MASTER, STEM_SEPARATION } from "./pricing";

export const PRODUCT = {
  name: "Auralith Forge",
  tagline: "Master your music. Keep what makes it yours.",
  freeMasters: PLANS.free.masterLimit, // lifetime, never resets
  previewSeconds: 30,
  retentionHours: 48,
  maxUploadMb: 200,
  supportedFormats: ["WAV", "AIFF", "FLAC", "MP3", "M4A", "AAC", "OGG", "WMA", "MP4", "WebM"],
  codecPreviews: ["MP3 128 kbps", "AAC 128/256 kbps", "Opus 128 kbps"],
  stems: { parts: "vocals and accompaniment", includedPerMonthOn: "pro", includedPerMonth: 20 },
  analysisToolsFree: true, // chord, key and BPM detection: free and unlimited on every plan
};

// Which plans get what — mirrors the backend gates above.
export const PLAN_FEATURES = {
  professionalEngine: ["studio", "pro"],
  bundledStems: ["pro"],
  shareLinks: ["pro"],
};

export const SUPPORTED_FORMATS_TEXT = `${PRODUCT.supportedFormats.slice(0, -1).join(", ")} and ${PRODUCT.supportedFormats.at(-1)}`;

// "Free (3 masters, one-time) → Indie €4.99/mo (15) → Studio €9.99/mo (50) →
// All-Access €19.99/mo (250)". Built from PLANS so every page that describes
// the plan ladder stays in step with the pricing grid.
export function planLadderText() {
  return PLAN_ORDER.map((key) => {
    const p = PLANS[key];
    if (key === "free") return `Free (${p.masterLimit} masters, one-time trial, no card)`;
    return `${p.label} ${p.price}${p.period} (${p.masterLimit} masters/month)`;
  }).join(" → ");
}

export function paidEntryText() {
  const indie = PLANS.indie;
  return `${indie.label} at ${indie.price}${indie.period} for ${indie.masterLimit} masters a month, or ${SINGLE_MASTER.price} for a single master`;
}

// Feature-by-feature comparison, one row per axis, one value per plan in
// PLAN_ORDER ("—"/false = not included). Shared by the in-app Plans panel
// and the public /pricing page. Every row must match what the backend
// enforces (see the sources list at the top of this file).
export const PLAN_COMPARISON = [
  { label: "Masters", values: [`${PLANS.free.masterLimit} total (one-time)`, `${PLANS.indie.masterLimit} / month`, `${PLANS.studio.masterLimit} / month`, `${PLANS.pro.masterLimit} / month`] },
  { label: "Standard engine", values: [true, true, true, true] },
  { label: "Professional engine", values: [false, false, true, true] },
  { label: "Stem separation", values: ["Pay per use", "Pay per use", "Pay per use", `${PRODUCT.stems.includedPerMonth} / month included`] },
  { label: "Chord, key & BPM detection", values: ["Free, unlimited", "Free, unlimited", "Free, unlimited", "Free, unlimited"] },
  { label: "Codec preview & level-matched A/B", values: [true, true, true, true] },
  { label: "Shareable download links", values: [false, false, false, true] },
];

export { PLANS, PLAN_ORDER, SINGLE_MASTER, STEM_SEPARATION };
