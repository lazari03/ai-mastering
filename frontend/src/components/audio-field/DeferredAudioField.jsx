"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// next/dynamic so `three` (and this component's own geometry setup) never
// lands in the initial bundle for visitors who skip it entirely below —
// same reasoning as DeferredThreads.jsx for `ogl`/Threads.
const ThreeAudioField = dynamic(() => import("./ThreeAudioField"), { ssr: false });

// Same gating as DeferredThreads.jsx, on purpose: prefers-reduced-motion
// and mobile viewports skip the WebGL layer entirely and fall back to the
// section's own static gradient/background — this is progressive
// enhancement, never the content layer (spec: SEO/content must not depend
// on WebGL). Desktop mounts only after "load" + an idle tick, so it never
// competes with first paint or the mastering flow's own JS.
export default function DeferredAudioField(props) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (reduceMotion || isMobile) return undefined;

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
  return <ThreeAudioField {...props} />;
}
