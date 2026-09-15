"use client";

function formatDelta(deltaPct) {
  if (deltaPct == null) return null;
  const up = deltaPct > 0;
  const flat = deltaPct === 0;
  return (
    <span className={`ml-1.5 text-[11px] font-semibold ${flat ? "text-zinc-500" : up ? "text-emerald-400" : "text-ember"}`}>
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(deltaPct)}%
    </span>
  );
}

// withDelta()-shaped value from analyticsQueryService.js's getOverview:
// { value, previous, deltaPct } — or a bare number/string for stats that
// don't have a comparison (e.g. a static count).
export default function StatCard({ label, stat, suffix = "" }) {
  const isDeltaShape = stat && typeof stat === "object" && "value" in stat;
  const display = isDeltaShape ? stat.value : stat;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-white">
        {typeof display === "number" ? display.toLocaleString() : display}
        {suffix}
      </p>
      {isDeltaShape && stat.deltaPct != null ? formatDelta(stat.deltaPct) : null}
    </div>
  );
}
