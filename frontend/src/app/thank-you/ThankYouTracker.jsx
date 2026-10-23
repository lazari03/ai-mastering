"use client";

import { useEffect, useRef } from "react";

import { trackEvent } from "@/lib/analytics";

// Fires the first-party "purchase" event once, on landing here from a
// successful Polar checkout redirect. Best-effort/client-side: it uses what
// the user clicked (plan/price), not a server-confirmed amount.
// Deliberately NOT sent to Meta: trackEvent() has no Meta mapping for
// "purchase". Meta's Purchase is server-only, from the Polar webhook
// (backend-node metaConversionsService.js), with the real amount — immune
// to ad blockers and closed tabs, and never double-counted with this.
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
