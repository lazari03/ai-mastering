// Guard: every internal link in the frontend source must resolve to a real
// App Router route, and every hash anchor must exist on the page it targets.
//
// Statically extracts hrefs from Link/<a>/router calls, object-literal `href:`
// fields, href={CONST} / href={CTA.x} identifiers, path literals in the lib
// link tables, ?redirect= / ?next= targets, nav config exports, llms.txt and
// sitemap.js, then checks each against src/app/**/page.js with dynamic segments
// validated against the real slug lists. An anchor is looked up only in the
// target page's own import graph (page.js + everything it renders + layout).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { register } from "node:module";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

// Let node load source files that use the "@/..." alias.
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = ${JSON.stringify(pathToFileURL(SRC).href)} + "/" + specifier.slice(2);
    return next(/\\.[mc]?jsx?$/.test(base) ? base : base + ".js", context);
  }
  if (/^\\.{1,2}\\//.test(specifier) && !/\\.[mc]?jsx?$|\\.json$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`),
  import.meta.url,
);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const read = (f) => readFileSync(f, "utf8");
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

// ---- real routes -------------------------------------------------------
const APP_DIR = join(SRC, "app");
const pageFiles = walk(APP_DIR).filter((f) => /[\\/]page\.jsx?$/.test(f));
const routeFiles = new Map(
  pageFiles.map((f) => ["/" + relative(APP_DIR, f).split(sep).slice(0, -1).join("/"), f]),
);
const routes = [...routeFiles.keys()];

const imp = (p) => import(pathToFileURL(join(SRC, p)).href);
const genres = (await imp("content/genrePages.js")).GENRE_KEYS;
const comparisons = (await imp("content/comparisonPages.js")).COMPARISON_KEYS;
const posts = (await imp("content/posts.js")).POSTS.map((p) => p.slug);
const nav = await imp("lib/navigation.js");
const { CTA, planSignupHref } = await imp("lib/internalLinks.js");

const DYNAMIC_VALUES = { "/master/[genre]": genres, "/vs/[competitor]": comparisons, "/blog/[slug]": posts };
// Params that are runtime ids, not slug lists: any non-empty value is valid.
const FREE_FORM = new Set(["/shared/[jobId]", "/admin/users/[uid]", "/admin/analytics/sessions/[sessionId]"]);

/** Returns the matching route pattern (e.g. "/master/[genre]") or null. */
function matchRoute(path) {
  if (path === "") path = "/";
  if (path.length > 1) path = path.replace(/\/$/, "");
  if (routeFiles.has(path)) return path;
  const pParts = path.split("/");
  for (const route of routes) {
    if (!route.includes("[")) continue;
    const rParts = route.split("/");
    if (rParts.length !== pParts.length) continue;
    if (!rParts.every((r, i) => (r.startsWith("[") ? Boolean(pParts[i]) : r === pParts[i]))) continue;
    if (FREE_FORM.has(route)) return route;
    const values = DYNAMIC_VALUES[route];
    assert.ok(values, `no slug list registered for dynamic route ${route}`);
    if (values.includes(pParts[rParts.findIndex((p) => p.startsWith("["))])) return route;
  }
  return null;
}
const resolveRoute = (path) => matchRoute(path) !== null;

// ---- per-page import graph and ids ------------------------------------
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, base + ".js", base + ".jsx", join(base, "index.js"), join(base, "index.jsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const IMPORT_RE = /(?:import|export)\s[^'";]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
const graphCache = new Map();
function graph(entry) {
  if (graphCache.has(entry)) return graphCache.get(entry);
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    for (const m of read(f).matchAll(IMPORT_RE)) {
      const dep = resolveImport(f, m[1] || m[2] || m[3]);
      if (dep && !seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  graphCache.set(entry, seen);
  return seen;
}
const ID_RE = /\bid=(?:\{\s*)?["']([\w-]+)["']/g;
const idsInFiles = (files) => new Set([...files].flatMap((f) => [...read(f).matchAll(ID_RE)].map((m) => m[1])));
const LAYOUT = join(APP_DIR, "layout.js");
const pageGraph = (route) => new Set([...graph(routeFiles.get(route)), ...graph(LAYOUT)]);

/** Does `hash` exist as an id on the page that serves `path`? */
function anchorOnPage(path, hash) {
  const route = matchRoute(path);
  return route !== null && idsInFiles(pageGraph(route)).has(hash);
}
/** Same-file "#x": the id must exist on at least one page that renders this file. */
function localAnchorExists(file, hash) {
  const containing = routes.map(pageGraph).filter((g) => g.has(file));
  if (!containing.length) return idsInFiles(graph(file)).has(hash);
  return containing.some((g) => idsInFiles(g).has(hash));
}

// ---- target checking ---------------------------------------------------
// Static assets and API paths that are not pages.
const NON_PAGE = /^\/(artist-preset-template\.json|opengraph-image|robots\.txt|sitemap\.xml|llms\.txt|audio\/|worklets\/|api\/)/;

/** Returns a list of problems for one raw href (empty when fine). */
function checkTarget(target, file = null) {
  if (!target || /^(https?:|mailto:|tel:|data:|blob:|\/\/)/.test(target)) return [];
  if (target.startsWith("#")) {
    const hash = target.slice(1);
    if (!hash || !file) return [];
    return localAnchorExists(file, hash) ? [] : [`anchor #${hash} not found on any page rendering this file`];
  }
  if (!target.startsWith("/")) return [];
  const u = new URL(target, "http://x");
  if (NON_PAGE.test(u.pathname)) return [];
  const problems = [];
  if (!resolveRoute(u.pathname)) problems.push(`no route for ${u.pathname}`);
  else if (u.hash.length > 1 && !anchorOnPage(u.pathname, u.hash.slice(1))) problems.push(`anchor ${u.hash} not found on ${u.pathname}`);
  // Post-login / post-action destinations must themselves resolve.
  for (const key of ["redirect", "next"]) {
    const dest = u.searchParams.get(key);
    if (dest && dest.startsWith("/")) problems.push(...checkTarget(dest, null).map((p) => `${key}=: ${p}`));
  }
  return problems;
}

// ---- extraction --------------------------------------------------------
const files = walk(SRC).filter((f) => /\.(js|jsx)$/.test(f));
const PATTERNS = [
  /\bhref=(?:"|'|\{\s*"|\{\s*')([^"'`]*)["']/g, // href="/x" and href={"/x"}
  /\bhref:\s*["']([^"'`]*)["']/g, // { href: "/x" }
  /\brouter\.(?:push|replace)\(\s*["']([^"'`]*)["']/g,
  /\bredirect\(\s*["']([^"'`]*)["']/g,
  /\bwindow\.location\.(?:href\s*=|assign\(|replace\()\s*["']([^"'`]*)["']/g,
];
const TEMPLATE = /\b(?:href=\{|href:\s*|router\.(?:push|replace)\()\s*`([^`]*)`/g;
const IDENT_HREF = /\bhref=\{\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)?)\s*\}/g;
// Files holding link tables: any path-looking string literal in them is a link.
const LINK_TABLE_FILES = ["lib/navigation.js", "lib/internalLinks.js", "lib/studio.js"].map((f) => join(SRC, f));

function collect() {
  const found = [];
  for (const f of files) {
    const src = read(f);
    const rel = relative(ROOT, f);
    for (const re of PATTERNS) for (const m of src.matchAll(re)) found.push({ file: f, rel, line: lineOf(src, m.index), target: m[1] });
    for (const m of src.matchAll(TEMPLATE)) found.push({ file: f, rel, line: lineOf(src, m.index), target: m[1], template: true });
    // href={CONST} / href={CTA.x}: resolve through the file's own string
    // constants or the CTA table.
    const consts = Object.fromEntries([...src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'](\/[^"']*)["']/g)].map((m) => [m[1], m[2]]));
    for (const m of src.matchAll(IDENT_HREF)) {
      const [obj, key] = m[1].split(".");
      const value = key ? (obj === "CTA" ? CTA[key] : undefined) : consts[obj];
      if (obj === "CTA" && !key) continue;
      if (obj === "CTA" && value === undefined) found.push({ file: f, rel, line: lineOf(src, m.index), target: `/__unknown_CTA_${key}` });
      else if (typeof value === "string") found.push({ file: f, rel, line: lineOf(src, m.index), target: value });
    }
    if (LINK_TABLE_FILES.includes(f)) {
      for (const m of src.matchAll(/["'](\/[a-z#?][^"'\s${}]*)["']/g)) {
        if (/^\/[a-z-]*\.?\w*$/.test(m[1]) || m[1].length > 1) found.push({ file: f, rel, line: lineOf(src, m.index), target: m[1] });
      }
    }
  }
  return found;
}

test("every static internal link resolves to a real route (and anchor, and redirect target)", () => {
  const bad = [];
  let checked = 0;
  for (const item of collect()) {
    if (item.template) {
      // /master/${g}, /blog/${slug}, /vs/${key}, /app?tab=${k}: validate the static prefix.
      const prefix = item.target.split("${")[0];
      if (!prefix.startsWith("/") || prefix === "/") continue;
      const base = prefix.split("?")[0].replace(/\/$/, "");
      const dynamic = routes.filter((r) => r.includes("["));
      const ok = routeFiles.has(base) || dynamic.some((r) => r.startsWith(base + "/")) || NON_PAGE.test(prefix);
      if (!ok) bad.push(`${item.rel}:${item.line} template ${item.target}`);
      continue;
    }
    checked++;
    for (const p of checkTarget(item.target, item.file)) bad.push(`${item.rel}:${item.line} ${item.target} -> ${p}`);
  }
  assert.ok(checked > 80, `expected to check many links, got ${checked}`);
  assert.deepEqual(bad, []);
});

test("the skip-link target #main exists on every public page layout", () => {
  for (const file of ["src/components/site/Page.jsx", "src/app/HomeClient.jsx"]) {
    assert.match(read(join(ROOT, file)), /<main id="main"/, file);
  }
});

test("CTA table and planSignupHref output resolve (including ?redirect=)", () => {
  const bad = [];
  for (const [name, href] of Object.entries(CTA)) for (const p of checkTarget(href)) bad.push(`CTA.${name} ${href} -> ${p}`);
  for (const plan of ["free", "studio", "all_access", "pro"]) {
    for (const billing of ["monthly", "yearly"]) {
      const href = planSignupHref(plan, billing);
      for (const p of checkTarget(href)) bad.push(`planSignupHref(${plan},${billing}) ${href} -> ${p}`);
    }
  }
  assert.ok(Object.keys(CTA).length >= 4);
  assert.deepEqual(bad, []);
});

test("sign-in / sign-up hrefs have a single source (navigation.js)", () => {
  assert.equal(CTA.signup, nav.SIGNUP);
  assert.equal(CTA.signin, nav.SIGNIN);
  const dupes = files.filter((f) => /["']\/login\?mode=signup["']/.test(read(f)) && !/lib[\\/](navigation|studio)\.js$/.test(f));
  assert.deepEqual(dupes.map((f) => relative(ROOT, f)), []);
});

test("navigation config: every href resolves and every label key exists in en + sq", () => {
  const i18n = read(join(SRC, "lib/i18n.js"));
  const bad = [];
  const lists = {
    PRIMARY_NAV: nav.PRIMARY_NAV,
    TOOLS_HUB: [nav.TOOLS_HUB],
    PRODUCT_NAV: nav.PRODUCT_NAV,
    RESOURCES_GUIDES_NAV: nav.RESOURCES_GUIDES_NAV,
    RESOURCES_MISC_NAV: nav.RESOURCES_MISC_NAV,
    LEGAL_NAV: nav.LEGAL_NAV,
    ADMIN_NAV: nav.ADMIN_NAV,
    GENRE_NAV: nav.GENRE_NAV,
    COMPARE_NAV: nav.COMPARE_NAV,
    PUBLIC_TOOLS: nav.PUBLIC_TOOLS,
    STUDIO: nav.STUDIO_GROUPS.flatMap((g) => g.tools),
    NOT_FOUND: Object.values(nav.NOT_FOUND_LINKS).flat(),
  };
  for (const [name, items] of Object.entries(lists)) {
    assert.ok(items.length > 0, `${name} is empty`);
    for (const item of items) {
      for (const p of checkTarget(item.href)) bad.push(`${name}: ${item.href} -> ${p}`);
      if (item.labelKey && !new RegExp(`"${item.labelKey.replace(/\./g, "\\.")}":\\s*\\{[^}]*?\\ben:[^}]*?\\bsq:`, "s").test(i18n)) {
        bad.push(`${name}: i18n key ${item.labelKey} missing en/sq`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("the desktop bar stays compact: /tools is not in PRIMARY_NAV (sq label wraps at 1024px)", () => {
  assert.ok(!nav.PRIMARY_NAV.some((i) => i.href === "/tools"));
  assert.equal(nav.TOOLS_HUB.href, "/tools");
});

test("every public page is reachable from the header, footer or tools hub", () => {
  const reachable = new Set(
    [
      nav.PRIMARY_NAV, [nav.TOOLS_HUB], nav.PRODUCT_NAV, nav.RESOURCES_GUIDES_NAV, nav.RESOURCES_MISC_NAV, nav.LEGAL_NAV,
      nav.GENRE_NAV, nav.COMPARE_NAV, nav.PUBLIC_TOOLS, nav.STUDIO_GROUPS.flatMap((g) => g.tools),
    ]
      .flat()
      .map((i) => i.href.split(/[?#]/)[0]),
  );
  const mustLink = [
    "/tools", "/pricing", "/blog", "/lufs-meter", "/song-key-finder", "/bpm-finder", "/chord-detector",
    "/chord-progression-finder", "/mastering-loudness-targets", "/ai-mastering-online", "/privacy", "/terms", "/refund", "/newsletter",
  ];
  assert.deepEqual(mustLink.filter((p) => !reachable.has(p)), []);
});

test("llms.txt URLs resolve to routes", () => {
  const bad = [];
  for (const m of read(join(ROOT, "public/llms.txt")).matchAll(/https:\/\/auralithforge\.app(\/[^\s)>"']*)?/g)) {
    const path = (m[1] || "/").replace(/[.,;:]+$/, "");
    for (const p of checkTarget(path)) bad.push(`llms.txt ${path} -> ${p}`);
  }
  assert.deepEqual(bad, []);
});

test("sitemap.js only lists existing routes", async () => {
  // sitemap.js imports JSX (lib/seo), so read its static paths and slug-list
  // usage from source and resolve the lists the same way it does.
  const src = read(join(SRC, "app/sitemap.js"));
  const bad = [];
  for (const m of src.matchAll(/\bpath:\s*"(\/[^"]*)"/g)) if (!resolveRoute(m[1])) bad.push(m[1]);
  const lists = {
    POSTS: posts.map((s) => `/blog/${s}`),
    GENRE_KEYS: genres.map((s) => `/master/${s}`),
    COMPARISON_KEYS: comparisons.map((s) => `/vs/${s}`),
    TOOL_LANDING_KEYS: (await imp("content/toolLandingPages.js")).TOOL_LANDING_KEYS.map((s) => `/${s}`),
  };
  for (const [name, paths] of Object.entries(lists)) {
    assert.match(src, new RegExp(`\\b${name}\\b`), `sitemap.js no longer uses ${name}`);
    for (const p of paths) if (!resolveRoute(p)) bad.push(p);
  }
  assert.deepEqual(bad, []);
});

test("/app?tab=<key> deep links use real AppClient tab keys", () => {
  const app = read(join(SRC, "app/app/AppClient.jsx"));
  const block = app.slice(app.indexOf("const TABS = ["), app.indexOf("const TOP_TABS"));
  const keys = new Set([...block.matchAll(/\bkey:\s*"([\w-]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size >= 5, "could not read TABS keys");
  const bad = [];
  for (const item of collect()) {
    if (item.template) continue;
    const m = item.target.match(/^\/app\?(?:[^"']*&)?tab=([\w-]+)/);
    if (m && !keys.has(m[1])) bad.push(`${item.rel}:${item.line} tab=${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test("safeInternalPath only accepts same-origin relative paths", () => {
  const ok = ["/app?tab=plans#billing", "/app", "/app?tab=plans&billing=yearly", "/admin/analytics"];
  const reject = ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null, undefined, "/a\nb"];
  for (const v of ok) assert.equal(nav.safeInternalPath(v), v);
  for (const v of reject) assert.equal(nav.safeInternalPath(v), "/app", String(v));
  assert.equal(nav.loginWithRedirect("/app?tab=plans"), "/login?redirect=%2Fapp%3Ftab%3Dplans");
  assert.equal(nav.loginWithRedirect("//evil.com"), "/login?redirect=%2Fapp");
});

test("signed-out gates preserve the destination and the login honours it safely", () => {
  assert.match(read(join(SRC, "app/app/AppClient.jsx")), /loginWithRedirect\(/);
  assert.match(read(join(SRC, "components/admin/AdminAuthGate.jsx")), /loginWithRedirect\(/);
  assert.match(read(join(SRC, "app/login/LoginClient.jsx")), /safeInternalPath\(redirectTo/);
});

test("mobile menu is inert and focus-trapped when closed/open", () => {
  const header = read(join(SRC, "components/marketing/SiteHeader.jsx"));
  assert.match(header, /inert=\{!menuOpen\}/);
  assert.match(header, /e\.key !== "Tab"/);
  assert.match(header, /min-width: 1024px/);
});

test("shared page canonical is its own URL, not the non-route /shared", () => {
  const src = read(join(SRC, "app/shared/[jobId]/page.js"));
  assert.doesNotMatch(src, /path:\s*"\/shared"/);
  assert.match(src, /path:\s*`\/shared\/\$\{/);
});
