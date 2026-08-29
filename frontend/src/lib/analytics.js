// Maps this app's internal event names (the vocabulary every trackEvent()
// call site already uses — sign_up, begin_checkout, purchase, see
// authStore.js/PlansPanel.jsx/ThankYouTracker.jsx) to Meta Pixel's and
// TikTok Pixel's own standard event names. The three platforms don't
// share one taxonomy, so "sign_up" needs translating per platform.
// "login" has no real standard-event equivalent on either (it isn't a
// conversion event ad platforms optimize toward) and is deliberately
// left unmapped rather than forced onto something meaningless.
const META_EVENT_MAP = {
  sign_up: "CompleteRegistration",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

// TikTok's purchase-completion standard event is named "CompletePayment",
// not "Purchase" — the one place its taxonomy actually diverges from
// Meta's here.
const TIKTOK_EVENT_MAP = {
  sign_up: "CompleteRegistration",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
};

// Meta/TikTok only care about value/currency/which-items out of whatever
// params a call site passes (see e.g. ThankYouTracker.jsx's items shape)
// — forwarding GA4's full params object as-is would work too (extra keys
// are harmless), but this keeps what's actually sent to each ad platform
// explicit rather than implicit.
function pixelParams(params) {
  if (params.value == null && !params.currency) return undefined;
  return {
    value: params.value,
    currency: params.currency,
    content_ids: params.items?.map((item) => item.item_id),
  };
}

// Thin wrapper around window.gtag/fbq/ttq — every call is a safe no-op for
// whichever of the three isn't loaded (not configured, or the user hasn't
// accepted the cookie banner — see Analytics.jsx), so call sites (
// authStore, checkout, etc.) never need to check for that themselves.
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;

  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }

  const metaEvent = META_EVENT_MAP[name];
  if (metaEvent && typeof window.fbq === "function") {
    window.fbq("track", metaEvent, pixelParams(params));
  }

  const tiktokEvent = TIKTOK_EVENT_MAP[name];
  if (tiktokEvent && typeof window.ttq?.track === "function") {
    window.ttq.track(tiktokEvent, pixelParams(params));
  }
}
