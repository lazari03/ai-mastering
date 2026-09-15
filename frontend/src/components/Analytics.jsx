"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { getStoredConsent } from "./CookieBanner";

// Plausible — cookieless, no personal data, no consent-mode complexity to
// wire up. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to turn this on.
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

// Ad conversion pixels — separate purpose from Plausible above (that
// measures traffic; these let Meta/TikTok attribute and optimize ad spend
// against sign_up/begin_checkout/purchase, see lib/analytics.js's
// trackEvent). Get each ID from Meta Events Manager / TikTok Events
// Manager after creating a pixel there.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

// Meta's own base pixel snippet, written out instead of pasted-in-minified
// — functionally identical (same queue-until-loaded shim: window.fbq
// queues calls into fbq.queue until fbevents.js loads and replaces the
// shim with the real implementation), just readable. If Meta's Events
// Manager ever hands you a structurally different snippet when you
// generate a fresh pixel, trust that one over this — Meta's pixel
// behavior isn't something this repo can verify by hitting their API at
// build/deploy time the way GA's measurement ID is used directly.
function loadMetaPixel(pixelId) {
  if (window.fbq) return;
  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  window.fbq = fbq;
  window._fbq = window._fbq || fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

// TikTok's base pixel snippet, same "written out, not verified against a
// live call" caveat as loadMetaPixel above — double-check this against
// the exact snippet TikTok Events Manager gives you for this pixel ID
// before relying on it for real ad spend attribution.
function loadTikTokPixel(pixelId) {
  if (window.ttq) return;
  const ttq = (window.ttq = window.ttq || []);
  if (ttq.loaded) return;
  const methods = [
    "page", "track", "identify", "instances", "debug", "on", "off", "once", "ready",
    "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent",
  ];
  ttq.methods = methods;
  ttq.setAndDefer = (target, method) => {
    target[method] = (...args) => target.push([method, ...args]);
  };
  methods.forEach((method) => ttq.setAndDefer(ttq, method));
  ttq.instance = (id) => {
    const instance = ttq._i?.[id] || [];
    methods.forEach((method) => ttq.setAndDefer(instance, method));
    return instance;
  };
  ttq.load = (id) => {
    const url = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {};
    ttq._i[id] = [];
    ttq._t = ttq._t || {};
    ttq._t[id] = Date.now();
    const script = document.createElement("script");
    script.async = true;
    script.src = `${url}?sdkid=${id}&lib=ttq`;
    document.head.appendChild(script);
  };
  ttq.loaded = true;

  ttq.load(pixelId);
  ttq.page();
}

export default function Analytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!PLAUSIBLE_DOMAIN && !META_PIXEL_ID && !TIKTOK_PIXEL_ID) {
      // Also caught at build time in next.config.mjs (a much louder,
      // impossible-to-miss warning in the build log) — this one's for
      // whoever's staring at DevTools on the live site wondering why
      // nothing shows, without having to go dig through build logs first.
      // Scoped to Plausible specifically (traffic measurement) rather than
      // the pixels too — running ad pixels without Plausible, or vice
      // versa, is a legitimate setup, not something worth warning about.
      if (process.env.NODE_ENV === "production" && !PLAUSIBLE_DOMAIN) {
        console.warn("[Analytics] NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set — no traffic analytics will load on this page.");
      }
      return;
    }
    const sync = () => setEnabled(getStoredConsent() === "accepted");
    sync();
    window.addEventListener("cookie-consent-changed", sync);
    return () => window.removeEventListener("cookie-consent-changed", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!META_PIXEL_ID && !TIKTOK_PIXEL_ID) return;
    // Deferred past "load", not fired the instant consent is confirmed —
    // for a repeat visitor (consent already stored) that confirmation
    // happens immediately on mount, which would otherwise pull in these
    // scripts during the exact window PageSpeed scores. The page_view
    // effect below only fires once each provider's global actually
    // exists, so nothing is lost, just delayed a few hundred ms.
    const loadAll = () => {
      if (META_PIXEL_ID) loadMetaPixel(META_PIXEL_ID);
      if (TIKTOK_PIXEL_ID) loadTikTokPixel(TIKTOK_PIXEL_ID);
    };
    if (document.readyState === "complete") {
      loadAll();
      return;
    }
    window.addEventListener("load", loadAll, { once: true });
    return () => window.removeEventListener("load", loadAll);
  }, [enabled]);

  // SPA route changes — most navigation in this app is client-side and
  // never hits the server, so without this explicit re-fire each provider
  // only ever sees the very first page someone lands on.
  useEffect(() => {
    if (!enabled) return;
    if (META_PIXEL_ID && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
    if (TIKTOK_PIXEL_ID && typeof window.ttq?.page === "function") {
      window.ttq.page();
    }
  }, [pathname, enabled]);

  if (!enabled) return null;
  if (!PLAUSIBLE_DOMAIN) return null;

  return <script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />;
}
