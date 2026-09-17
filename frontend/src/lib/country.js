// geoip-lite (backend-node's analyticsService.js) returns a plain ISO
// 3166-1 alpha-2 code ("US", "AL", ...) — this turns that into something a
// human reads at a glance, using only what's already built into the
// runtime (no country-name/flag-emoji package to keep updated).
let regionNames = null;
function getRegionNames() {
  if (regionNames) return regionNames;
  try {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    regionNames = { of: () => null };
  }
  return regionNames;
}

// Regional indicator symbols are exactly 127397 (0x1F1E6 - 'A'.charCodeAt(0))
// above each ASCII letter — "US" -> 🇺🇸. Every current renderer (all
// browsers, the OS font on desktop/mobile) already supports this; no
// image assets needed.
export function countryFlag(code) {
  if (typeof code !== "string" || code.length !== 2) return "";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(...[...upper].map((c) => 127397 + c.charCodeAt(0)));
}

export function countryName(code) {
  if (typeof code !== "string" || code.length !== 2) return code || null;
  return getRegionNames().of(code.toUpperCase()) || code;
}

// "🇺🇸 United States" — the one composed label most call sites want.
export function countryLabel(code) {
  if (!code) return "—";
  const flag = countryFlag(code);
  const name = countryName(code);
  return flag ? `${flag} ${name}` : name;
}
