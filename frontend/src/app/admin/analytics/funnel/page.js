"use client";

import { useEffect, useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import { LoadingBlock } from "@/components/ui/Spinner";

export default function AdminFunnelPage() {
  const [preset, setPreset] = useState("7d");
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSteps(null);
    getAdminAnalytics("/funnel", { preset })
      .then((res) => !cancelled && setSteps(res))
      .catch((err) => !cancelled && setError(err?.message || "Failed to load funnel."));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const maxCount = steps?.[0]?.count || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Funnel</h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!steps && !error ? <LoadingBlock /> : null}
      {steps ? (
        <div className="space-y-2">
          {steps.map((step) => (
            <div key={step.key} className="rounded-xl border border-white/10 bg-black/20 p-3.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-white">{step.label}</span>
                <span className="font-mono text-zinc-300">{step.count.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-ember to-brass" style={{ width: `${Math.max(2, (step.count / maxCount) * 100)}%` }} />
              </div>
              <p className="m-0 mt-1.5 text-[11px] text-zinc-500">
                {step.conversionFromPrevious}% from previous step · {step.conversionFromVisitors}% of all visitors
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
