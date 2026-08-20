// Thin wrapper around window.gtag — every call is a safe no-op if GA
// hasn't loaded yet (not configured, or the user hasn't accepted the
// cookie banner), so call sites (authStore, checkout, etc.) never need to
// check for that themselves.
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
