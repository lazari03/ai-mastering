"use client";

// Spec section 37: "Tables should have responsive/mobile alternatives."
// One real <table> in a horizontal-scroll wrapper reads better on a phone
// than fighting a table into stacked cards would for data this tabular
// (many numeric columns side by side is the whole point of an acquisition/
// pages/errors report) — the scroll container keeps the page itself from
// ever scrolling horizontally.
export default function AdminTable({ columns, rows, emptyLabel = "No data for this period." }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">{emptyLabel}</p>;
  }
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className="border-b border-white/5 text-zinc-200 last:border-0">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2.5 ${col.align === "right" ? "text-right font-mono" : ""}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
