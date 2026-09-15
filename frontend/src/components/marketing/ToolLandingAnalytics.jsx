"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";

// ToolLandingPage.jsx is a server component (no client-side hooks) — this
// is the one client boundary it needs, just to fire free_tool_opened once
// per landing-page visit for the funnel-source breakdown (bpm-finder,
// song-key-finder, chord-progression-finder).
export default function ToolLandingAnalytics({ slug }) {
  useEffect(() => {
    trackEvent("free_tool_opened", { source_tool: slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
