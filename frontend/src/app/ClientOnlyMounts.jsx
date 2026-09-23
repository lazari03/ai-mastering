"use client";

import dynamic from "next/dynamic";

// `dynamic(..., { ssr: false })` isn't allowed inside a Server Component
// (layout.js) as of Next.js 16 — this thin Client Component wrapper is
// the whole fix: the ssr:false calls just need to originate from
// somewhere already running client-side.
//
// AuthInit pulls in the full Firebase Auth SDK (initializeApp + getAuth,
// ~tens of KB) via authStore -> lib/firebase. Loading it dynamically keeps
// that out of the shared chunk every page pays for, including pure
// marketing pages that never read auth state — it code-splits into its
// own chunk, loaded after hydration instead of blocking the initial
// payload. Same reasoning for AnalyticsPageTracker: it only ever does
// anything in a real browser (localStorage, document.visibilityState,
// sendBeacon), so it costs nothing to load client-side, post-hydration.
const AuthInit = dynamic(() => import("./AuthInit"), { ssr: false });
const AnalyticsPageTracker = dynamic(() => import("@/components/AnalyticsPageTracker"), { ssr: false });
// Loaded lazily: it only ever appears after scroll/exit intent, and it
// pulls in the motion library — which otherwise landed in every page's
// main bundle, including static SEO pages that don't animate anything.
const PromoPopup = dynamic(() => import("@/components/marketing/PromoPopup"), { ssr: false });

export default function ClientOnlyMounts() {
  return (
    <>
      <AuthInit />
      <AnalyticsPageTracker />
      <PromoPopup />
    </>
  );
}
