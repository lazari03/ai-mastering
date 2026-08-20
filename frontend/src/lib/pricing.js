// Mirrors PRICING.md / backend-node's settings.polarProducts +
// entitlementsService.js's PLAN_MASTER_LIMITS — kept here once so the
// landing page, Settings, and MasteringConsole all show the same numbers
// instead of each hardcoding its own copy. EUR — matches the Polar
// organization's default presentment currency.
//
// Two paid plans + Free, nothing purchasable à la carte:
//   Free    — 3 masters/month, Standard only, no stems, no chords
//   Studio  — 50 masters/month, Standard + Professional, stems included, no chords
//   All-Access — 250 masters/month (5x Studio), everything, unlimited chord detection
export const PLANS = {
  free: {
    key: "free",
    item: null,
    label: "Free",
    price: "€0",
    period: "",
    masterLimit: 3,
    blurb: "Get a real master before you pay anything.",
    features: ["3 full-length masters / month", "Unlimited 30s mastering previews"],
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
