// Mirrors PRICING.md / backend-node's settings.polarProducts +
// entitlementsService.js's PLAN_MASTER_LIMITS — kept here once so the
// landing page, Settings, and MasteringConsole all show the same numbers
// instead of each hardcoding its own copy. EUR — matches the Polar
// organization's default presentment currency.
//
// Three paid plans + Free, plus one one-time purchase (SINGLE_MASTER below):
//   Free       — 3 masters TOTAL (one-time trial, never resets), Standard only
//   Indie      — 15 masters/month (resets monthly), Standard + Professional
//   Studio     — 50 masters/month (resets monthly), Standard + Professional
//   All-Access — 250 masters/month (5x Studio, resets monthly), everything
// Chord detection is unconditionally free for everyone (see
// /chord-detector) — it's not part of any plan's paywall.
//
// Annual billing is twelve months for the price of ten (the two-months-
// free convention). Every annual figure below is exactly monthly × 10, so
// the saving is real and reconciles against the invoice rather than being
// a rounded marketing number.
export const BILLING_PERIODS = ["monthly", "annual"];
export const ANNUAL_MONTHS_CHARGED = 10;

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
    // No annual variant — there's nothing to bill yearly at €0, and a
    // "€0/yr" column next to real prices is just noise.
    annual: null,
  },
  // Entry paid tier. The jump from Free (3 masters, ever) straight to
  // Studio at €9.99 is the sharpest drop-off in the funnel: someone who
  // puts out one track a month has no reason to pay for 50, so they sit
  // on Free indefinitely and convert to nothing. This is priced to be an
  // easy first payment rather than a considered subscription decision,
  // which is the entire job of a first paid tier.
  indie: {
    key: "indie",
    item: "plan_indie",
    label: "Indie",
    price: "€4.99",
    period: "/mo",
    masterLimit: 15,
    blurb: "For one release a month, not fifty.",
    features: ["15 masters / month", "Standard & Professional engines", "Codec preview & instant A/B"],
    annual: { item: "plan_indie_annual", price: "€49.90", period: "/yr", perMonth: "€4.16" },
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
    annual: { item: "plan_studio_annual", price: "€99.90", period: "/yr", perMonth: "€8.33" },
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
    annual: { item: "plan_pro_annual", price: "€199.90", period: "/yr", perMonth: "€16.66" },
  },
};

export const PLAN_ORDER = ["free", "indie", "studio", "pro"];

// The one place that resolves "which plan, billed how often" into the
// price, period and checkout item to actually use — so the homepage grid,
// the in-app Plans panel and the checkout call can't drift into
// disagreeing about what a plan costs. Falls back to the monthly figures
// for any plan without an annual variant (Free), which keeps call sites
// free of `plan.annual ? … : …` branching.
export function planPricing(plan, billing = "monthly") {
  if (billing !== "annual" || !plan.annual) {
    return { price: plan.price, period: plan.period, item: plan.item, perMonth: null, isAnnual: false };
  }
  return { price: plan.annual.price, period: plan.annual.period, item: plan.annual.item, perMonth: plan.annual.perMonth, isAnnual: true };
}

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
