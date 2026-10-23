import { track } from "./analyticsClient";
import { hasMetaConsent, metaTrack } from "./metaPixel";

// Every call site across the app (authStore.js, PlansPanel.jsx,
// masteringStore.js, ChordDetector.jsx, HomeClient.jsx, SiteHeader.jsx,
// PublicChordDetector.jsx, PublicLufsMeter.jsx, ...) already calls
// trackEvent() at exactly the funnel moments worth measuring — this is
// the one place that forwards those calls into the first-party analytics
// pipeline (analyticsClient.js -> /analytics/collect -> SQLite) and, with
// cookie consent, to Meta (Pixel here, CAPI twin from the server —
// DECISIONS.md D-007). Never call fbq from a component.

// Our event -> Meta event. Mirrors COLLECT_TO_META in backend-node's
// metaConversionsService.js (which is the real boundary). Purchase is NOT
// here: it is server-only, from the Polar webhook.
const META_EVENTS = {
  pricing_view: "ViewContent",
  signup_completed: "CompleteRegistration",
  begin_checkout: "InitiateCheckout",
  // Only the user's first real master — decided server-side (/master
  // returns first_master: true exactly once per user).
  master_completed: (params) => (params.first_master === true ? "FirstMasterCompleted" : null),
};

function metaEventName(name, params) {
  const mapped = META_EVENTS[name];
  return typeof mapped === "function" ? mapped(params) : mapped || null;
}

function metaParams(name, params) {
  if (name === "begin_checkout") return { value: Number(params.value) || 0, currency: params.currency || "EUR" };
  if (name === "pricing_view") return { content_name: "pricing" };
  if (name === "master_completed") return params.tier ? { tier: params.tier } : {};
  return {};
}

function newEventId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function trackEvent(name, params = {}) {
  let meta = null;
  try {
    const metaName = typeof window !== "undefined" && hasMetaConsent() ? metaEventName(name, params) : null;
    if (metaName) {
      const eventId = newEventId();
      metaTrack(metaName, metaParams(name, params), eventId);
      // Same id goes to /analytics/collect so the server's CAPI twin dedups.
      meta = { eventId, url: `${window.location.origin}${window.location.pathname}` };
    }
  } catch {
    meta = null;
  }
  track(name, params, meta);
}
