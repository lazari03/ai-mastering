"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

import { getStoredConsent } from "./CookieBanner";
import { META_PIXEL_ID, captureFbclid, ensureFbc, initMetaPixel, metaTrack, revokeMetaConsent } from "@/lib/metaPixel";

// Meta Pixel — back for a paid-ads test (DECISIONS.md D-007). Same consent
// gate as Analytics.jsx: nothing from Meta loads until the visitor accepts
// cookies, and Accept starts it immediately (cookie-consent-changed), no
// reload. Funnel events go through trackEvent() (lib/analytics.js), never
// direct fbq calls in components; this file only loads the script and
// sends PageView on every App Router navigation.
export default function MetaPixel() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!META_PIXEL_ID) return;
    captureFbclid();
    const sync = () => {
      const accepted = getStoredConsent() === "accepted";
      if (accepted) {
        initMetaPixel();
        ensureFbc();
      } else {
        revokeMetaConsent();
      }
      setEnabled(accepted);
    };
    sync();
    window.addEventListener("cookie-consent-changed", sync);
    return () => window.removeEventListener("cookie-consent-changed", sync);
  }, []);

  useEffect(() => {
    // The admin dashboard is the owner's own traffic (see AnalyticsPageTracker).
    if (!enabled || pathname.startsWith("/admin")) return;
    metaTrack("PageView");
  }, [enabled, pathname]);

  if (!enabled || !META_PIXEL_ID) return null;
  // The fbq stub is installed by initMetaPixel(); this only fetches the SDK,
  // which drains the queued init/PageView calls once it runs.
  return <Script id="meta-pixel" strategy="afterInteractive" src="https://connect.facebook.net/en_US/fbevents.js" />;
}
