// Mirrors PRICING.md / backend-node's settings.polarProducts keys — kept
// here once so the landing page, Settings, and MasteringConsole all show
// the same numbers instead of each hardcoding its own copy.
// EUR — matches the Polar organization's default presentment currency.
//
// Three plans, not a subscription plus a pile of à la carte items:
//   Free    — 3 Standard masters/month, no Professional tier, no stems
//   Studio  — everything Free has, plus unlimited Standard + Professional
//             mastering and stem separation
//   All-Access — everything Studio has, plus unlimited chord detection
// Chord detection stays a small one-time credit for Free/Studio users who
// don't want to jump straight to the top plan just for it.
export const PLANS = {
  free: {
    key: "free",
    item: null,
    label: "Free",
    price: "€0",
    period: "",
    blurb: "Get a real master before you pay anything.",
    features: ["3 full-length Standard masters / month", "Unlimited Clean Audio", "Unlimited 30s mastering previews"],
  },
  studio: {
    key: "studio",
    item: "plan_studio",
    label: "Studio",
    price: "€9.99",
    period: "/mo",
    blurb: "For anyone mastering more than a few tracks a month.",
    features: ["Everything in Free", "Unlimited Standard & Professional masters", "Stem separation included"],
  },
  pro: {
    key: "pro",
    item: "plan_pro",
    label: "All-Access",
    price: "€19.99",
    period: "/mo",
    blurb: "The full toolkit, nothing metered.",
    features: ["Everything in Studio", "Unlimited chord detection"],
  },
};

export const PLAN_ORDER = ["free", "studio", "pro"];

export const CHORDS = { item: "chords", label: "Chord Detection", price: "€1.49", blurb: "One full chord/key/BPM analysis." };
