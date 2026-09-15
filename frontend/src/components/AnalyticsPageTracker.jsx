"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { initAnalyticsClient, trackPageView } from "@/lib/analyticsClient";

// Mounted once in the root layout (spec section 4: "Track SPA route
// changes correctly"). Next.js App Router navigations never hit the
// server for a client-side transition, so this is the one place a
// page_view can reliably fire for every route change, not just the
// initial load.
//
// Deliberately reads the query string via window.location.search inside
// the effect, NOT next/navigation's useSearchParams — that hook forces
// every page that (transitively) renders it out of static rendering
// unless wrapped in its own <Suspense>, which would have silently undone
// the ISR strategy layout.js's revalidate=300 comment describes for the
// whole marketing surface. usePathname alone carries no such cost.
export default function AnalyticsPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalyticsClient();
  }, []);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    trackPageView(search ? `${pathname}${search}` : pathname);
  }, [pathname]);

  return null;
}
