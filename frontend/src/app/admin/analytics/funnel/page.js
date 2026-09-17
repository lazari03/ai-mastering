"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import { IconFunnel } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

export default function AdminFunnelPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("7d");
  const { data: steps, error, loading } = useAdminQuery(() => getAdminAnalytics("/funnel", { preset }), [preset, t]);

  const maxCount = steps?.[0]?.count || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
          <IconFunnel />
          {t("admin.funnel.title")}
        </h1>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!steps && loading ? <LoadingBlock /> : null}
      {steps ? (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {steps.map((step) => (
            <div key={step.key} className="rounded-xl border border-white/10 bg-black/20 p-3.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-white">{t(`admin.funnel.step.${step.key}`)}</span>
                <span className="font-mono text-zinc-300">{step.count.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-ember to-brass" style={{ width: `${Math.max(2, (step.count / maxCount) * 100)}%` }} />
              </div>
              <p className="m-0 mt-1.5 text-[11px] text-zinc-500">
                {t("admin.funnel.fromPrevious", { pct: step.conversionFromPrevious })} · {t("admin.funnel.ofVisitors", { pct: step.conversionFromVisitors })}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
