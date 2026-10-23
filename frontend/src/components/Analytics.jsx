"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

import { getStoredConsent } from "./CookieBanner";

// Plausible — cookieless, no personal data, no consent-mode complexity to
// wire up. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to turn this on. First-party
// /analytics/collect and TelemetryDeck are sent from lib/analyticsClient.js.
// The only other third-party script is the Meta Pixel (MetaPixel.jsx),
// re-added for a paid-ads test behind the same consent gate (DECISIONS.md
// D-007). Google Analytics and TikTok Pixel remain removed.
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

  // next/script, not a bare <script>: this component only renders the tag
  // client-side (after consent), and React never executes a <script> it
  // creates on the client unless it is `async` (React's own dev warning:
  // "Scripts inside React components are never executed when rendering on
  // the client"). The old `<script defer ...>` therefore never loaded.
  return <Script id="plausible" strategy="afterInteractive" data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />;
}
