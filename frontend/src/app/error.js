"use client";

import { useEffect } from "react";

import StatePanel from "@/components/site/StatePanel";

// Route-level error boundary: a server/render failure on any page lands
// here instead of a blank screen, with a retry and a way out.
export default function RouteError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-[1080px] px-4 py-16 sm:px-6">
      <StatePanel
        tone="error"
        eyebrow="Something went wrong"
        title="This page failed to load"
        body="It's on our side, not yours. Try again — if it keeps happening, your files and masters are safe; head back to the app or the homepage."
        headingLevel={1}
        actions={[
          { label: "Try again", onClick: () => reset() },
          { href: "/app", label: "Open the app" },
        ]}
      />
      {error?.digest ? <p className="text-center font-mono text-[11px] text-text-secondary">Reference: {error.digest}</p> : null}
    </main>
  );
}
