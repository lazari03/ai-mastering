"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { getStoredConsent } from "./CookieBanner";

// Plausible — cookieless, no personal data, no consent-mode complexity to
// wire up. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to turn this on.
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

// GA4 — set NEXT_PUBLIC_GA_MEASUREMENT_ID (the "G-XXXXXXXXXX" from
// Analytics > Admin > Data Streams) to turn this on. Both providers can run
// side by side; both are gated behind the same cookie-banner acceptance,
// checked/re-checked live via the "cookie-consent-changed" event
// CookieBanner fires — accepting or later withdrawing consent takes effect
// immediately, no reload needed.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

function loadGtag(measurementId) {
  if (window.gtag) return; // already loaded (e.g. consent toggled off then back on)
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  // send_page_view:false — the pathname effect below is the single source
  // of every page_view (including the first one), so gtag's own automatic
  // page_view on config doesn't fire a duplicate for the initial load.
  window.gtag("config", measurementId, { anonymize_ip: true, send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

export default function Analytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!PLAUSIBLE_DOMAIN && !GA_MEASUREMENT_ID) return;
    const sync = () => setEnabled(getStoredConsent() === "accepted");
    sync();
    window.addEventListener("cookie-consent-changed", sync);
    return () => window.removeEventListener("cookie-consent-changed", sync);
  }, []);

  useEffect(() => {
    if (enabled && GA_MEASUREMENT_ID) loadGtag(GA_MEASUREMENT_ID);
  }, [enabled]);

  // SPA route changes — most navigation in this app is client-side and
  // never hits the server, so without this explicit event GA only ever
  // sees the very first page someone lands on.
  useEffect(() => {
    if (enabled && GA_MEASUREMENT_ID && window.gtag) {
      window.gtag("event", "page_view", { page_path: pathname, page_location: window.location.href });
    }
  }, [pathname, enabled]);

  if (!enabled) return null;
  if (!PLAUSIBLE_DOMAIN) return null;

  return <script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />;
}
