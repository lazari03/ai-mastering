// Regression: PlansPanel.jsx called localized() without importing it, so the
// whole Plans/billing tab threw ReferenceError at render and hit the app error
// boundary ("It's on our side, not yours"). Guard: any source file that calls
// localized(...) must import or define it.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("every file calling localized() imports or defines it", () => {
  const bad = [];
  for (const file of walk(new URL("../src", import.meta.url).pathname)) {
    const src = readFileSync(file, "utf8");
    if (!/(^|[^.\w])localized\(/m.test(src)) continue;
    const defined = /import\s*\{[^}]*\blocalized\b[^}]*\}\s*from/.test(src) || /function\s+localized\b|const\s+localized\b/.test(src);
    if (!defined) bad.push(file);
  }
  assert.deepEqual(bad, []);
});
