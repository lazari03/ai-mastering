// Mirrors PRICING.md / backend-node's settings.polarProducts +
// entitlementsService.js's PLAN_MASTER_LIMITS — kept here once so the
// landing page, Settings, and MasteringConsole all show the same numbers
// instead of each hardcoding its own copy. EUR — matches the Polar
// organization's default presentment currency.
//
// Two paid plans + Free, plus one one-time purchase (SINGLE_MASTER below):
//   Free    — 3 masters TOTAL (one-time trial, never resets), Standard only, no stems, no chords
//   Studio  — 50 masters/month (resets monthly), Standard + Professional, stems included, no chords
//   All-Access — 250 masters/month (5x Studio, resets monthly), everything, unlimited chord detection
export const PLANS = {
  free: {
    key: "free",
    item: null,
    label: "Free",
    price: "€0",
    period: "",
    masterLimit: 3,
    blurb: "Try 3 full masters, on the house — no card required.",
    features: ["3 full-length masters, one-time trial", "Unlimited 30s mastering previews"],
  },
  studio: {
    key: "studio",
    item: "plan_studio",
    label: "Studio",
    price: "€9.99",
    period: "/mo",
    masterLimit: 50,
    blurb: "For anyone mastering regularly.",
    features: ["50 masters / month", "Standard & Professional engines"],
  },
  pro: {
    key: "pro",
    item: "plan_pro",
    label: "All-Access",
    price: "€19.99",
    period: "/mo",
    masterLimit: 250,
    blurb: "The full toolkit, 5x Studio's headroom.",
    features: [
      "250 masters / month",
      "Everything in Studio",
      "Stem separation, 20/month included",
      "Unlimited chord detection",
      "Shareable download links",
    ],
  },
};

export const PLAN_ORDER = ["free", "studio", "pro"];

// Low-commitment top-up, not a plan — "master this one track" for
// someone whose actual need is a single release, not a recurring
// subscription (see entitlementsService.js's extra-credit system). Price
// here is a display label only — the real price is whatever's configured
// on the "single_master" one-time product in Polar's dashboard; keep
// this in sync with that by hand if it ever changes there.
export const SINGLE_MASTER = {
  item: "single_master",
  label: "Single Master",
  price: "€2.99",
  blurb: "One extra master, no subscription. Same Standard/Professional engine as your plan.",
};

// Standalone product — chord detection for anyone who wants it without a
// mastering subscription (a guitarist working out one song, say). Priced
// below Single Master since it's analysis-only, no multi-stage DSP
// render. 3 free lifetime (never resets, same one-time-trial shape as
// Free's master quota), then pay per song. Included unlimited on
// All-Access regardless — this is only relevant to Free/Studio users.
export const CHORD_DETECTION = {
  item: "chord_detection",
  label: "Chord Detection",
  price: "€1.49",
  freeLimit: 3,
  blurb: "Key, BPM, and chord progression for one song. 3 free, then pay per song — or unlimited on All-Access.",
};

// Standalone recurring subscription — for anyone who'd rather pay a flat
// cheap monthly rate than per song. Priced to undercut Moises (~$40/yr,
// ~€3/mo) on a monthly basis for this narrower, single-purpose tool.
// Independent from the main mastering plan — a Free or Studio user can
// subscribe to this without touching their mastering plan at all;
// All-Access already includes unlimited chords, so this isn't offered
// there (redundant).
export const CHORDS_MONTHLY = {
  item: "chords_monthly",
  label: "Chords Monthly",
  price: "€2.99",
  period: "/mo",
  blurb: "Unlimited chord detection, no mastering plan needed.",
};

// One-time — an extra stem-separated master. All-Access includes 20/month
// (see PLANS.pro.features); once that runs out, or for Free/Studio (who
// get no bundled stem access at all), this buys one stem-separated render.
// Priced above Single Master — Demucs source separation plus multiple
// output stems per job is genuinely heavier server cost than one file.
export const STEM_SEPARATION = {
  item: "stem_separation",
  label: "Stem Separation",
  price: "€4.99",
  blurb: "One stem-separated master (vocals, drums, bass, other). Included free on All-Access, 20/month.",
};
