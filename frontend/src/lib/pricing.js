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
    features: ["50 masters / month", "Standard & Professional engines", "Stem separation included"],
  },
  pro: {
    key: "pro",
    item: "plan_pro",
    label: "All-Access",
    price: "€19.99",
    period: "/mo",
    masterLimit: 250,
    blurb: "The full toolkit, 5x Studio's headroom.",
    features: ["250 masters / month", "Everything in Studio", "Unlimited chord detection", "Shareable download links"],
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
