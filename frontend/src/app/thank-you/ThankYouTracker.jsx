"use client";

import { useEffect, useRef } from "react";

import { trackEvent } from "@/lib/analytics";

// Fires GA4's "purchase" event once, on landing here from a successful
// Polar checkout redirect. Best-effort/client-side: Polar doesn't hand the
// real order back on redirect, so this uses what the user actually clicked
// (plan/price) rather than a server-confirmed amount, and it's missed
// entirely if someone closes the tab before the redirect completes or has
// analytics blocked. Upgrading to a server-confirmed version means firing
// this same event via GA4's Measurement Protocol from the Polar webhook
// handler instead (real order amount, immune to ad-blockers/closed tabs) —
// needs a GA4 API secret, not just the measurement ID this client-side
// version runs on.
export default function ThankYouTracker({ plan, item, price }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !item) return;
    fired.current = true;
    const value = Number(String(price).replace(/[^\d.]/g, "")) || 0;
    trackEvent("purchase", {
      currency: "EUR",
      value,
      transaction_id: `${item}_${Date.now()}`,
      items: [{ item_id: item, item_name: plan, price: value }],
    });
  }, [plan, item, price]);

  return null;
}
