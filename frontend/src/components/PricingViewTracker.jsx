"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";

// Funnel step: fires once per mount of /pricing (no props, no PII).
export default function PricingViewTracker() {
  useEffect(() => {
    trackEvent("pricing_view");
  }, []);
  return null;
}
