"use client";

import { useEffect, useState } from "react";

import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";

/**
 * Render status for the fullscreen loader (AppClient) and the console.
 *
 * A master is one synchronous request: the backend reports no intermediate
 * progress. This used to animate a 3→94% bar and cycle phase names on a
 * 900 ms timer, which presented invented progress as real. It now reports
 * only what's actually known — that a render is running, for how long, and
 * how it ended. The loader shows the engine's pipeline as "what happens",
 * not as a live step tracker.
 */
export function useMasteringProgress() {
  const { t } = useLanguage();
  const { isSubmitting, result, error } = useMasteringStore();
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isSubmitting) return undefined;
    const start = Date.now();
    setStartedAt(start);
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isSubmitting]);

  let status = "idle";
  if (isSubmitting) status = "running";
  else if (result) status = "done";
  else if (error) status = "error";

  const phaseMessage =
    status === "running" ? t("console.phase.running") : status === "done" ? t("console.masteringComplete") : status === "error" ? t("console.masteringStopped") : "";

  return { status, elapsedSec, startedAt, phaseMessage };
}
