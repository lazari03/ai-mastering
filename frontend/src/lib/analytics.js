// Every third-party tracker (Google Analytics, Meta Pixel, TikTok Pixel)
// has been removed from this app. trackEvent() is kept as a no-op stub
// rather than deleted, since dozens of call sites across the app
// (authStore.js, PlansPanel.jsx, masteringStore.js, ChordDetector.jsx,
// HomeClient.jsx, SiteHeader.jsx, ToolLandingAnalytics.jsx,
// PublicChordDetector.jsx, ...) already call it at exactly the funnel
// moments worth measuring — ripping those out would mean re-instrumenting
// all of them from scratch the next time this app gets any analytics
// destination (first-party or otherwise). For now, every call here goes
// nowhere and does nothing.
export function trackEvent() {}
