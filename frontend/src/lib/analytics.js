import { track } from "./analyticsClient";

// Every call site across the app (authStore.js, PlansPanel.jsx,
// masteringStore.js, ChordDetector.jsx, HomeClient.jsx, SiteHeader.jsx,
// PublicChordDetector.jsx, PublicLufsMeter.jsx, ...) already calls
// trackEvent() at exactly the funnel moments worth measuring — this is
// now the one place that forwards those calls into the first-party
// analytics pipeline (analyticsClient.js -> /analytics/collect ->
// Firestore), replacing what used to go to Google Analytics/Meta/TikTok.
export function trackEvent(name, params = {}) {
  track(name, params);
}
