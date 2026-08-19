"use client";

import { useEffect, useState } from "react";

import { getStoredConsent } from "./CookieBanner";

// Plausible — cookieless, no personal data, no consent-mode complexity to
// wire up. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN (your site's bare domain, e.g.
// "auralithforge.app") to turn this on; unset it and this renders nothing,
// same as today. Only loads after the cookie banner is accepted, and stops
// again immediately if consent is later withdrawn — a real gate, not
// decorative.
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!PLAUSIBLE_DOMAIN) return;

    const sync = () => setEnabled(getStoredConsent() === "accepted");
    sync();

    window.addEventListener("cookie-consent-changed", sync);
    return () => window.removeEventListener("cookie-consent-changed", sync);
  }, []);

  if (!PLAUSIBLE_DOMAIN || !enabled) return null;

  return <script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />;
}
