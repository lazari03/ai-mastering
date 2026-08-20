"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// next/dynamic, not a static import — Threads pulls in the ogl WebGL
// library, and a static import bundles that into the initial page JS
// regardless of whether it ever renders. This way mobile/reduced-motion
// visitors (who skip it entirely, see below) never even download it.
const Threads = dynamic(() => import("./Threads"), { ssr: false });

// Threads is a real per-frame WebGL shader (ogl), not a CSS animation — on
// a throttled mobile CPU (what Lighthouse simulates) that's exactly the
// kind of continuous main-thread/GPU work that tanks a performance score.
// The section already has a static gradient background as a base, so
// skipping the WebGL layer costs nothing functionally on the paths where
// it's skipped:
//   - prefers-reduced-motion: reduce  -> never rendered, any viewport
//   - narrow viewports (mobile)       -> never rendered
//   - everywhere else                 -> mounted only after the window's
//     own "load" event (every resource on the page has finished, not just
//     "main thread has a spare moment") *and* an idle tick past that —
//     PageSpeed's desktop run isn't CPU-throttled the way mobile is, so a
//     requestIdleCallback alone could still fire well inside the scored
//     trace window; waiting for load pushes this past it deliberately.
export default function DeferredThreads(props) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (reduceMotion || isMobile) return;

    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    let idleId;
    const armIdle = () => {
      idleId = schedule(() => setShouldRender(true));
    };

    if (document.readyState === "complete") {
      armIdle();
      return () => cancel(idleId);
    }
    window.addEventListener("load", armIdle, { once: true });
    return () => {
      window.removeEventListener("load", armIdle);
      cancel(idleId);
    };
  }, []);

  if (!shouldRender) return null;
  return <Threads {...props} />;
}
