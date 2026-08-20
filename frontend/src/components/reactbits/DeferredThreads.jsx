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
//   - everywhere else                 -> mounted one tick after paint via
//     requestIdleCallback, so it never competes with the initial
//     LCP/TBT window Lighthouse actually scores
export default function DeferredThreads(props) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (reduceMotion || isMobile) return;

    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = schedule(() => setShouldRender(true));
    return () => cancel(id);
  }, []);

  if (!shouldRender) return null;
  return <Threads {...props} />;
}
