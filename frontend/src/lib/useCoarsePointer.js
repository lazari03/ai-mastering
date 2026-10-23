"use client";

import { useEffect, useState } from "react";

// True on touch-first devices (phones, tablets). False during SSR and the
// first client render, so markup never mismatches — the touch-specific
// copy swaps in right after mount.
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return coarse;
}
