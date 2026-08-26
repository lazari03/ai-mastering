"use client";

import { useEffect, useState } from "react";

import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";

/**
 * Simulated render-progress timeline, extracted from what used to be
 * local state inside MasteringConsole so both the fullscreen loader
 * (AppClient) and the console's own UI can read the same live values —
 * one timer, not two independently-drifting ones. Reacts to isSubmitting/
 * result/error straight from the store, so nothing besides mounting this
 * hook is required at the call site.
 */
export function useMasteringProgress() {
  const { t } = useLanguage();
  const { isSubmitting, result, error } = useMasteringStore();
  const [progress, setProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState("");
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const phases = [
      t("console.phase.queue"),
      t("console.phase.read"),
      t("console.phase.analyzeLoudness"),
      t("console.phase.estimateBalance"),
      t("console.phase.applyTone"),
      t("console.phase.refine"),
      t("console.phase.render"),
      t("console.phase.prepare"),
    ];

    if (isSubmitting) {
      let tick = 0;
      setProgress(3);
      setPhaseMessage(phases[0]);
      setLogs([{ ts: Date.now(), text: `${new Date().toLocaleTimeString()}  ${phases[0]}` }]);

      const id = setInterval(() => {
        tick += 1;

        setProgress((prev) => {
          if (prev < 55) return Math.min(55, prev + 6);
          if (prev < 78) return Math.min(78, prev + 3);
          return Math.min(94, prev + 1);
        });

        const phaseIndex = Math.min(phases.length - 1, Math.floor(tick / 2));
        const text = phases[phaseIndex];
        setPhaseMessage(text);

        if (tick % 2 === 0) {
          setLogs((prev) => [...prev, { ts: Date.now(), text: `${new Date().toLocaleTimeString()}  ${text}` }].slice(-8));
        }
      }, 900);

      return () => clearInterval(id);
    }

    if (result) {
      setProgress(100);
      setPhaseMessage(t("console.masteringComplete"));
      return undefined;
    }

    if (error) {
      setPhaseMessage(t("console.masteringStopped"));
      return undefined;
    }

    setProgress(0);
    setPhaseMessage("");
    setLogs([]);
    return undefined;
  }, [isSubmitting, result, error]); // eslint-disable-line react-hooks/exhaustive-deps

  return { progress, phaseMessage, logs };
}
