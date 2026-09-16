// Native CSV writer — no dependency. Every admin report this feeds is
// already a flat array of plain objects with scalar columns (numbers,
// short strings, ISO date strings) for a bounded date range — exactly the
// case a library like papaparse/csv-stringify earns nothing over.

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// columns: [{ key, label }] — label becomes the header row, key reads the
// row's value (or use a `render(row)` function on the column, same as
// AdminTable.jsx's own column shape, so callers can pass their existing
// column defs straight through).
export function toCsv(columns, rows) {
  const header = columns.map((col) => escapeCsvField(col.label)).join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(col.render ? col.render(row) : row[col.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}
