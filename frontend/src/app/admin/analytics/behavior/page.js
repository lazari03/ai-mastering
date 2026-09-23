"use client";

import { useState } from "react";

import { getAdminAnalytics } from "@/network/http/client";
import { useLanguage } from "@/lib/i18n";
import { useAdminQuery } from "@/lib/useAdminQuery";
import DateRangeFilter from "@/components/admin/DateRangeFilter";
import AdminTable from "@/components/admin/AdminTable";
import { IconTarget } from "@/components/admin/icons";
import { LoadingBlock } from "@/components/ui/Spinner";

// What visitors do, where they stop, and what to fix next — see
// backend-node analyticsBehaviorService.js. Insights come first because
// they're the answer; the tables underneath are the evidence.
const SEVERITY = {
  high: { label: "Fix first", cls: "border-red-400/40 bg-red-500/[0.08] text-red-200" },
  medium: { label: "Worth fixing", cls: "border-amber-400/40 bg-amber-500/[0.07] text-amber-200" },
  info: { label: "Note", cls: "border-white/15 bg-white/[0.03] text-zinc-300" },
};

function Panel({ title, hint, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <h2 className="m-0 text-sm font-bold text-white">{title}</h2>
      {hint ? <p className="m-0 mt-1 text-xs text-zinc-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Journey({ steps }) {
  const max = steps[0]?.count || 1;
  return (
    <ol className="m-0 list-none space-y-2 p-0">
      {steps.map((step, i) => (
        <li key={step.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-zinc-200">{step.label}</span>
            <span className="shrink-0 font-mono text-zinc-300">
              {step.count.toLocaleString()} <span className="text-zinc-500">· {step.pctOfStart}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#1f9686]" style={{ width: `${Math.max(1.5, (step.count / max) * 100)}%` }} />
          </div>
          {i > 0 && step.dropPct > 0 ? <p className="m-0 mt-1 text-[11px] text-zinc-500">−{step.dropPct}% from the previous step</p> : null}
        </li>
      ))}
    </ol>
  );
}

const pctCell = (key) => (r) => `${r[key]}%`;

export default function AdminBehaviorPage() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("30d");
  const { data, error, loading } = useAdminQuery(() => getAdminAnalytics("/behavior", { preset }), [preset, t]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
            <IconTarget />
            {t("admin.nav.behavior")}
          </h1>
          <p className="m-0 mt-1 text-xs text-zinc-500">What visitors do, where they stop, and what to fix next.</p>
        </div>
        <DateRangeFilter value={preset} onChange={setPreset} />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data && loading ? <LoadingBlock /> : null}

      {data ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <p className="m-0 text-xs text-zinc-500">
            {data.sample.sessions.toLocaleString()} sessions · {data.sample.visitors.toLocaleString()} visitors in this range
          </p>

          <Panel title="What to fix next" hint="Ranked by impact. Each rule only fires with enough sessions behind it.">
            <ul className="m-0 list-none space-y-3 p-0">
              {data.insights.map((insight) => {
                const sev = SEVERITY[insight.severity] || SEVERITY.info;
                return (
                  <li key={insight.title} className={`rounded-xl border p-4 ${sev.cls}`}>
                    <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{sev.label}</p>
                    <p className="m-0 mt-1 text-sm font-semibold text-white">{insight.title}</p>
                    <p className="m-0 mt-1 text-[13px] leading-relaxed text-zinc-300">{insight.detail}</p>
                    <p className="m-0 mt-2 text-[13px] leading-relaxed text-zinc-100">
                      <span className="font-semibold">Do this: </span>
                      {insight.action}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Product journey" hint="Each step counts only sessions that also reached the step before it.">
              <Journey steps={data.productJourney} />
            </Panel>
            <Panel title="Purchase journey">
              <Journey steps={data.purchaseJourney} />
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
                <div>
                  <p className="m-0 font-mono text-lg text-white">{data.engagement.bounceRate}%</p>
                  <p className="m-0 text-[11px] text-zinc-500">left without interacting</p>
                </div>
                <div>
                  <p className="m-0 font-mono text-lg text-white">{data.engagement.medianActiveSeconds}s</p>
                  <p className="m-0 text-[11px] text-zinc-500">median active time</p>
                </div>
                <div>
                  <p className="m-0 font-mono text-lg text-white">
                    {data.timeToFirstMaster.medianSeconds != null ? `${Math.round(data.timeToFirstMaster.medianSeconds / 60)}m` : "—"}
                  </p>
                  <p className="m-0 text-[11px] text-zinc-500">to first master</p>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Entry pages" hint="Where sessions start, and how well each page gets people to act.">
            <AdminTable
              columns={[
                { key: "page", label: "Page" },
                { key: "sessions", label: "Sessions" },
                { key: "bounceRate", label: "Left idle", render: pctCell("bounceRate") },
                { key: "triedRate", label: "Tried a tool", render: pctCell("triedRate") },
                { key: "masterRate", label: "Mastered", render: pctCell("masterRate") },
              ]}
              rows={data.entryPages.map((r) => ({ ...r, id: r.page }))}
            />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Devices">
              <AdminTable
                columns={[
                  { key: "label", label: "Device" },
                  { key: "share", label: "Share", render: pctCell("share") },
                  { key: "engagedRate", label: "Interacted", render: pctCell("engagedRate") },
                  { key: "triedRate", label: "Tried", render: pctCell("triedRate") },
                  { key: "masterRate", label: "Mastered", render: pctCell("masterRate") },
                ]}
                rows={data.devices.map((r) => ({ ...r, id: r.key }))}
              />
            </Panel>
            <Panel title="New vs returning">
              <AdminTable
                columns={[
                  { key: "label", label: "Visitors" },
                  { key: "share", label: "Share", render: pctCell("share") },
                  { key: "triedRate", label: "Tried", render: pctCell("triedRate") },
                  { key: "masterRate", label: "Mastered", render: pctCell("masterRate") },
                  { key: "paidRate", label: "Paid", render: pctCell("paidRate") },
                ]}
                rows={data.visitorTypes.map((r) => ({ ...r, id: r.key }))}
              />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Free tools" hint="Opened = the tool page loaded. Completed = the visitor got a result.">
              <AdminTable
                columns={[
                  { key: "label", label: "Tool" },
                  { key: "opened", label: "Opened" },
                  { key: "completionRate", label: "Got a result", render: pctCell("completionRate") },
                  { key: "thenMasteredRate", label: "Then mastered", render: pctCell("thenMasteredRate") },
                ]}
                rows={data.tools.map((r) => ({ ...r, id: r.tool }))}
              />
            </Panel>
            <Panel title="Where they go after landing" hint={`${data.engagement.exitedAfterLandingRate}% never open a second page.`}>
              <AdminTable
                columns={[
                  { key: "from", label: "From" },
                  { key: "to", label: "Next page" },
                  { key: "count", label: "Sessions" },
                ]}
                rows={data.nextSteps.map((r) => ({ ...r, id: `${r.from}>${r.to}` }))}
              />
            </Panel>
          </div>

          <Panel title="Reliability" hint="Server-observed renders only (previews excluded).">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Masters attempted", data.failures.masterAttempts],
                ["Failure rate", `${data.failures.masterFailureRate}%`],
                ["Upload failures", data.failures.uploadFailures],
                ["Chord analysis failures", data.failures.analysisFailures],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 p-3">
                  <p className="m-0 text-[11px] text-zinc-500">{label}</p>
                  <p className="m-0 mt-1 font-mono text-lg text-white">{value}</p>
                </div>
              ))}
            </div>
            {data.failures.reasons.length ? (
              <div className="mt-4">
                <AdminTable
                  columns={[
                    { key: "reason", label: "Failure reason" },
                    { key: "count", label: "Count" },
                  ]}
                  rows={data.failures.reasons.map((r) => ({ ...r, id: r.reason }))}
                />
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
