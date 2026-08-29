"use client";

import { useEffect, useState } from "react";

import { getAppBannerConfig } from "@/lib/firebase";

// Static top-of-app announcement bar — content and on/off flag both come
// from two Firebase Remote Config parameters (siteConfig: Boolean,
// appBanner: String), edited straight in the Firebase console. No
// redeploy to change the message or turn it off; this component just
// renders whatever Remote Config currently says, verbatim — the message
// itself is expected to carry any contact info it wants to include, not
// this component. Dismissing hides it for the current session only (not
// persisted) — it's meant to read as "the team has something to say
// right now," not as a one-time toast to permanently banish.
export default function TopBanner() {
  const [banner, setBanner] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAppBannerConfig()
      .then((data) => {
        if (!cancelled) setBanner(data);
      })
      .catch(() => {
        // Silent — a missing/unreachable config should never block the
        // app shell from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner?.enabled || !banner.message || dismissed) return null;

  return (
    <div className="relative flex items-center justify-center gap-3 border-b border-brass/25 bg-brass/[0.08] px-4 py-2 text-center text-xs text-zinc-200 sm:text-sm">
      <p className="m-0">{banner.message}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 text-zinc-500 hover:text-zinc-300"
      >
        ✕
      </button>
    </div>
  );
}
