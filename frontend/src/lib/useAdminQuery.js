"use client";

import { useEffect, useRef, useState } from "react";

// Every admin report page fetches on mount and again whenever its date
// range (or another dep) changes. The previous pattern nulled the data
// out before each fetch, which unmounted the whole content block and
// swapped in a full-page spinner on every single range click — visually
// indistinguishable from a page reload, and exactly the anti-pattern this
// project's own dataviz interaction spec calls out: "Refetch keeps the
// frame... no skeleton, no layout jump, no flash."
//
// This keeps the previous render mounted (and visible, dimmed by the
// caller via `loading`) across a refetch; only the very first load, with
// no data yet, has nothing to keep and falls back to a real loading state.
// `requestId` also closes a real race: if range A's request resolves after
// range B's (A was slower), A's stale response is dropped instead of
// clobbering B's already-rendered result.
export function useAdminQuery(fetcher, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    fetcher()
      .then((res) => {
        if (id !== requestId.current) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(err?.message || "Failed to load.");
        setLoading(false);
      });
    // deps is caller-controlled (mirrors the old useEffect dependency
    // arrays exactly), not statically analyzable here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
