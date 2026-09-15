// Mirrors PRICING.md / backend-node's settings.polarProducts +
// entitlementsService.js's PLAN_MASTER_LIMITS — kept here once so the
// landing page, Settings, and MasteringConsole all show the same numbers
// instead of each hardcoding its own copy. EUR — matches the Polar
// organization's default presentment currency.
//
// Two paid plans + Free, plus one one-time purchase (SINGLE_MASTER below):
//   Free    — 3 masters TOTAL (one-time trial, never resets), Standard only, no stems
//   Studio  — 50 masters/month (resets monthly), Standard + Professional, stems included
//   All-Access — 250 masters/month (5x Studio, resets monthly), everything
// Chord detection is unconditionally free for everyone (see
// /chord-detector) — it's not part of any plan's paywall.
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
    features: ["250 masters / month", "Everything in Studio", "Stem separation, 20/month included", "Shareable download links"],
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

// Chord detection used to be sold here (a lifetime trial then pay-per-song
// or a Chords Monthly subscription) — it's unconditionally free now (see
// backend-node's /analyze-chords), so there's nothing left to price.

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
