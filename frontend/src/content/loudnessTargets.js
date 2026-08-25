// Data for /mastering-loudness-targets — the reference page for "how loud
// should I master", "LUFS by genre", "what LUFS for Spotify" and similar
// searches. That intent is a genuine, high-volume question this app can
// answer with real numbers rather than opinion, which is the whole reason
// the page exists.
//
// SOURCE OF TRUTH: backend/params.py's GENRE_TARGET_PROFILES and
// MASTERING_STYLE_PROFILES, and the limiter defaults in
// ai_mastering/bus_processing.py. These are duplicated here, not imported
// — the frontend is JS and can't read the Python engine's tables at build
// time, and there's no runtime endpoint that exposes them.
//
// That duplication is the risk this file carries: publishing engine
// numbers on a public page that then drift from what the engine actually
// does is worse than publishing nothing, because it's the kind of
// concrete claim an AI answer engine will quote verbatim. If you change a
// target profile in params.py, change it here in the same commit. The
// GENRE_KEYS check at the bottom catches a genre being added or renamed;
// nothing can catch a number being edited, so that one is on you.
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";

// Ordered loudest-first — that's the axis a reader is actually scanning
// ("where does my genre sit?"), and it makes the dynamic-range column's
// inverse relationship visible without having to say it.
export const LOUDNESS_TARGETS = [
  {
    genre: "edm",
    targetLufs: -7.0,
    dynamicRangeDb: 6.0,
    maxStereoWidth: 1.35,
    note: "The loudest target in the set. Club and festival playback is the reference, where sustained energy matters more than transient detail.",
  },
  {
    genre: "hiphop",
    targetLufs: -8.0,
    dynamicRangeDb: 7.0,
    maxStereoWidth: 1.15,
    note: "Loud, but narrower than EDM — 808s and sub-bass need to stay centred and mono-solid, so width is held back deliberately.",
  },
  {
    genre: "pop",
    targetLufs: -9.0,
    dynamicRangeDb: 7.5,
    maxStereoWidth: 1.25,
    note: "Competitive on streaming without crushing vocal transients. The widest target outside EDM, since pop production leans on stereo synths and doubles.",
  },
  {
    genre: "rock",
    targetLufs: -9.5,
    dynamicRangeDb: 9.0,
    maxStereoWidth: 1.12,
    note: "More dynamic range than pop at a similar loudness — drum transients are the point, and squashing them costs more than the extra 0.5 dB is worth.",
  },
  {
    genre: "lofi",
    targetLufs: -12.0,
    dynamicRangeDb: 9.0,
    maxStereoWidth: 1.0,
    note: "Quieter and deliberately unwidened. The genre's character comes from restraint, and stereo enhancement reads as wrong on it.",
  },
  {
    genre: "acoustic",
    targetLufs: -14.0,
    dynamicRangeDb: 11.0,
    maxStereoWidth: 1.1,
    note: "Sits right around the streaming normalisation reference, which is where acoustic material translates best anyway.",
  },
  {
    genre: "podcast",
    targetLufs: -16.0,
    dynamicRangeDb: 7.0,
    maxStereoWidth: 0.2,
    note: "Near-mono by design (0.2 max width) and tightly controlled — speech needs consistent level far more than it needs dynamics or width.",
  },
  {
    genre: "classical",
    targetLufs: -18.0,
    dynamicRangeDb: 14.0,
    maxStereoWidth: 1.2,
    note: "The quietest target and by far the widest dynamic range. The distance between the quietest and loudest passage is the performance; compressing it is the one unforgivable move here.",
  },
];

// MASTERING_STYLE_PROFILES' target_lufs_delta — applied on top of the
// genre baseline above, so a rock track mastered in the rock_90s style
// targets -9.5 + -2.0 = -11.5 LUFS.
export const STYLE_DELTAS = [
  { style: "electronic_modern", label: "Electronic Modern", deltaLufs: 0.8, note: "The only style that pushes louder than the genre baseline." },
  { style: "rock_modern", label: "Rock Modern", deltaLufs: 0.0, note: "Takes the genre target as-is." },
  { style: "rock_2000s", label: "Rock 2000s", deltaLufs: -0.8, note: "Marginally back from the baseline." },
  { style: "modern", label: "Modern", deltaLufs: -1.0, note: "The default — a deliberate step back from the genre target, on the assumption that streaming is the destination." },
  { style: "stock_mastering_strip", label: "Stock Mastering Strip", deltaLufs: -1.4, note: "Conservative, transparent processing." },
  { style: "rock_90s", label: "Rock 90s", deltaLufs: -2.0, note: "The quietest style, matching an era mastered before the loudness war peaked." },
];

// From ai_mastering/bus_processing.py's true-peak limiter defaults.
export const LIMITER_SPEC = [
  { label: "True-peak ceiling", value: "-1.0 dBTP", note: "Applied regardless of genre or style." },
  { label: "Oversampling", value: "4x", note: "Catches inter-sample peaks a sample-peak limiter misses." },
  { label: "Lookahead", value: "3 ms", note: "Enough to catch transients without a hearable pre-response." },
  { label: "Release", value: "60 ms", note: "Fast enough to stay transparent, slow enough not to distort bass." },
];

// The loudness-raise caps (max_lufs_raise_db per style, plus the
// current-loudness clamps in mastering_params.py). Stated on the page
// because they contradict what most people assume an automatic engine
// does, and because "it refused to make my track louder" is otherwise a
// support question rather than a documented design decision.
export const RAISE_CAPS = {
  minDb: 0.9,
  maxDb: 4.5,
  clampNote:
    "Tighter still on material already loud: a mix arriving above -12 LUFS is capped at 0.5 dB of raise, above -10.7 LUFS at 0.2 dB.",
};

export const STREAMING_REFERENCE_LUFS = -14;

// Same fail-loud discipline as lib/internalLinks.js — a genre added to or
// renamed in genrePages.js without a row here breaks the build instead of
// quietly rendering a short table on a page whose whole value is being
// complete.
const COVERED = LOUDNESS_TARGETS.map((t) => t.genre);
for (const t of LOUDNESS_TARGETS) {
  if (!GENRE_KEYS.includes(t.genre)) {
    throw new Error(`loudnessTargets: unknown genre "${t.genre}" — not in genrePages.js`);
  }
}
for (const g of GENRE_KEYS) {
  if (!COVERED.includes(g)) {
    throw new Error(`loudnessTargets: genre "${g}" has no loudness target row — add one (source: backend/params.py)`);
  }
}

export const labelForGenre = (genre) => GENRE_PAGES[genre].label;
