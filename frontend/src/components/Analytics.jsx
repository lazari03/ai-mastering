"use client";

import { useEffect, useState } from "react";

import { getStoredConsent } from "./CookieBanner";

// Plausible — cookieless, no personal data, no consent-mode complexity to
// wire up. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to turn this on. This is the
// only analytics provider left in the app — Google Analytics, Meta Pixel,
// and TikTok Pixel have all been removed entirely.
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!PLAUSIBLE_DOMAIN) {
      // Also caught at build time in next.config.mjs (a much louder,
      // impossible-to-miss warning in the build log) — this one's for
      // whoever's staring at DevTools on the live site wondering why
      // nothing shows, without having to go dig through build logs first.
      if (process.env.NODE_ENV === "production") {
        console.warn("[Analytics] NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set — no analytics will load on this page.");
      }
      return;
    }
    const sync = () => setEnabled(getStoredConsent() === "accepted");
    sync();
    window.addEventListener("cookie-consent-changed", sync);
    return () => window.removeEventListener("cookie-consent-changed", sync);
  }, []);

  if (!enabled || !PLAUSIBLE_DOMAIN) return null;

  return <script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />;
}
