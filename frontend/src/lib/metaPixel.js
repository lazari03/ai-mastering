"use client";

// ---------------------------------------------------------------------
// Meta Pixel helpers. The script itself is loaded by components/MetaPixel.jsx,
// only when NEXT_PUBLIC_META_PIXEL_ID is set AND cookie consent is
// "accepted". Every function here re-checks consent and never throws:
// zero Meta requests (and no _fbc cookie) for anyone who hasn't accepted.
//
// Events reach this file only through trackEvent() (lib/analytics.js), which
// generates the event_id the server's CAPI twin reuses for deduplication.
// Purchase is never sent from the browser — it is server-only (Polar
// webhook -> backend-node metaConversionsService.js).
// ---------------------------------------------------------------------

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

const CONSENT_KEY = "cookie_consent";
const FBC_MAX_AGE_S = 90 * 24 * 60 * 60;
const STANDARD_EVENTS = new Set(["PageView", "ViewContent", "CompleteRegistration", "InitiateCheckout"]);

export function hasMetaConsent() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// _fbp is written by fbevents.js on the registrable domain
// (.auralithforge.app); _fbc goes to the same place so both are first-party
// on www, apex and app routes alike.
function cookieDomain() {
  const host = window.location.hostname;
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return "";
  return `; domain=.${host.split(".").slice(-2).join(".")}`;
}

// fbclid seen on the landing URL, kept in memory only (never stored before
// consent): a visitor who clicks an ad, browses, then accepts still gets
// attributed without us writing anything pre-consent.
let landingFbclid = null;
export function captureFbclid() {
  if (typeof window === "undefined" || landingFbclid) return;
  try {
    landingFbclid = new URLSearchParams(window.location.search).get("fbclid");
  } catch {
    landingFbclid = null;
  }
}

// fb.1.<ms>.<fbclid>, 90 days — Meta's documented _fbc format. Only after
// consent, and never overwriting an existing click id.
export function ensureFbc() {
  if (!hasMetaConsent() || !landingFbclid || readCookie("_fbc")) return;
  try {
    document.cookie = `_fbc=fb.1.${Date.now()}.${encodeURIComponent(landingFbclid)}; max-age=${FBC_MAX_AGE_S}; path=/${cookieDomain()}; SameSite=Lax`;
  } catch {
    // cookies blocked — CAPI simply goes without fbc
  }
}

export function clearMetaCookies() {
  try {
    for (const name of ["_fbc", "_fbp"]) {
      document.cookie = `${name}=; max-age=0; path=/`;
      document.cookie = `${name}=; max-age=0; path=/${cookieDomain()}`;
    }
  } catch {
    // nothing to clear
  }
}

/** What the server needs for the CAPI twin; null without consent. */
export function getMetaContext() {
  if (!hasMetaConsent()) return null;
  return { consent: "accepted", fbp: readCookie("_fbp"), fbc: readCookie("_fbc") };
}

// Meta's standard base-code stub (the fbq queue), minus the <script> tag
// injection, which MetaPixel.jsx does with next/script after consent.
export function initMetaPixel() {
  if (typeof window === "undefined" || !META_PIXEL_ID || !hasMetaConsent()) return false;
  if (!window.fbq) {
    const n = function (...args) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
  }
  if (!window.__afMetaPixelInit) {
    window.fbq("consent", "grant");
    window.fbq("init", META_PIXEL_ID);
    window.__afMetaPixelInit = true;
  }
  return true;
}

export function revokeMetaConsent() {
  try {
    if (window.fbq) window.fbq("consent", "revoke");
  } catch {
    // ignore
  }
  clearMetaCookies();
}

/**
 * fbq('track'|'trackCustom', name, params, { eventID }). No-op without
 * consent or without the pixel stub.
 */
export function metaTrack(metaEventName, params = {}, eventId = undefined) {
  try {
    if (typeof window === "undefined" || !window.fbq || !hasMetaConsent()) return;
    const method = STANDARD_EVENTS.has(metaEventName) ? "track" : "trackCustom";
    window.fbq(method, metaEventName, params, eventId ? { eventID: eventId } : undefined);
  } catch {
    // Meta must never break the product.
  }
}
