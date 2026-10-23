// Auralith Studio — the single map of every product that actually exists,
// grouped by what the musician is doing. Drives the header's Studio menu,
// the footer, /tools, and every "related tools" block, so those can never
// disagree about what the product is.
//
// Only real, shipping capabilities belong here. App-only features (no
// public landing page) point into the app instead of to an invented page.
// Labels are bilingual like the rest of the chrome (see lib/i18n.js).

export const APP_URL = "/app";
export const SIGNUP_URL = "/login?mode=signup";

export const STUDIO_GROUPS = [
  {
    key: "master",
    label: { en: "Master", sq: "Masterizo" },
    tools: [
      {
        key: "adaptive-mastering",
        href: "/ai-mastering-online",
        name: { en: "Adaptive Mastering", sq: "Masterizim Adaptiv" },
        blurb: {
          en: "Analyzes your mix first, then masters only what it needs.",
          sq: "Analizon miksin së pari, pastaj masterizon vetëm atë që duhet.",
        },
      },
      {
        key: "reference-mastering",
        href: "/app?tab=master",
        appOnly: true,
        name: { en: "Reference Mastering", sq: "Masterizim me Referencë" },
        blurb: {
          en: "Use a reference track as context for the tonal destination.",
          sq: "Përdor një këngë reference si kontekst për tonalitetin e synuar.",
        },
      },
    ],
  },
  {
    key: "analyze",
    label: { en: "Analyze", sq: "Analizo" },
    tools: [
      {
        key: "chord-detector",
        href: "/chord-detector",
        name: { en: "Chord Detector", sq: "Zbulues Akordesh" },
        blurb: { en: "Key, BPM and the full chord progression.", sq: "Tonaliteti, BPM dhe progresioni i plotë i akordeve." },
      },
      {
        key: "song-key-finder",
        href: "/song-key-finder",
        name: { en: "Song Key Finder", sq: "Gjetës Tonaliteti" },
        blurb: { en: "Find the musical key of any track.", sq: "Gjej tonalitetin muzikor të çdo kënge." },
      },
      {
        key: "bpm-finder",
        href: "/bpm-finder",
        name: { en: "BPM Finder", sq: "Gjetës BPM" },
        blurb: { en: "Detect the tempo of any song.", sq: "Zbulo tempon e çdo kënge." },
      },
      {
        key: "chord-progression-finder",
        href: "/chord-progression-finder",
        name: { en: "Chord Progression Finder", sq: "Gjetës Progresioni Akordesh" },
        blurb: { en: "Get the chord progression, section by section.", sq: "Merr progresionin e akordeve, seksion pas seksioni." },
      },
      {
        key: "lufs-meter",
        href: "/lufs-meter",
        name: { en: "LUFS Meter", sq: "Matës LUFS" },
        blurb: { en: "Integrated loudness, true peak and LRA.", sq: "Zëshmëria e integruar, piku i vërtetë dhe LRA." },
      },
    ],
  },
  {
    key: "prepare",
    label: { en: "Prepare", sq: "Përgatit" },
    tools: [
      {
        key: "stem-separation",
        href: "/app?tab=master",
        appOnly: true,
        name: { en: "Stem Separation", sq: "Ndarja e Stemave" },
        blurb: {
          en: "Separate vocals and accompaniment to rebalance before mastering.",
          sq: "Ndaj vokalin nga shoqërimi për ta ribalancuar para masterizimit.",
        },
      },
    ],
  },
  {
    key: "deliver",
    label: { en: "Deliver", sq: "Dorëzo" },
    tools: [
      {
        key: "codec-preview",
        href: "/app?tab=master",
        appOnly: true,
        name: { en: "Codec Preview", sq: "Parapamje Kodeku" },
        blurb: {
          en: "Hear your master as MP3/AAC before you release it.",
          sq: "Dëgjo masterin si MP3/AAC para se ta publikosh.",
        },
      },
    ],
  },
];

export const STUDIO_TOOLS = Object.fromEntries(STUDIO_GROUPS.flatMap((g) => g.tools.map((t) => [t.key, { ...t, group: g.key }])));

// Logical neighbours for "related tools" — what someone on this page is
// most likely to need next (not "every other tool").
export const RELATED_TOOLS = {
  "chord-detector": ["song-key-finder", "bpm-finder", "chord-progression-finder", "adaptive-mastering"],
  "song-key-finder": ["chord-detector", "bpm-finder", "chord-progression-finder", "adaptive-mastering"],
  "bpm-finder": ["song-key-finder", "chord-detector", "lufs-meter", "adaptive-mastering"],
  "chord-progression-finder": ["chord-detector", "song-key-finder", "bpm-finder", "adaptive-mastering"],
  "lufs-meter": ["adaptive-mastering", "codec-preview", "bpm-finder", "chord-detector"],
  "adaptive-mastering": ["lufs-meter", "reference-mastering", "stem-separation", "codec-preview"],
};

export function relatedTools(key) {
  return (RELATED_TOOLS[key] || []).map((k) => STUDIO_TOOLS[k]).filter(Boolean);
}

// Localized field helper for {en, sq} objects.
export function loc(value, lang) {
  if (value == null || typeof value === "string") return value;
  return value[lang] || value.en;
}
