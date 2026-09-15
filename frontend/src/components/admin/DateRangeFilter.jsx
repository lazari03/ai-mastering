"use client";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

// Spec section 18's date filter — presets only for now (no custom
// from/to picker yet, see the report's "known limitations"; the backend
// (resolveRange in analyticsQueryService.js) already accepts explicit
// from/to, so adding a picker later is a frontend-only change).
export default function DateRangeFilter({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${
            value === p.key ? "bg-brass text-[#100b08]" : "border border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
