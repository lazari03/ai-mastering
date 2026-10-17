// Guard: every internal link in the frontend source must resolve to a real
// App Router route. Statically extracts hrefs from Link/<a>/router calls,
// object-literal `href:` fields (nav config, content files), llms.txt and the
// nav config exports, then checks each against src/app/**/page.js with
// dynamic segments validated against the real slug lists.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

// ---- real routes -------------------------------------------------------
const pageFiles = walk(join(SRC, "app")).filter((f) => /[\\/]page\.jsx?$/.test(f));
const routes = pageFiles.map((f) => {
  const dir = relative(join(SRC, "app"), f).split(sep).slice(0, -1);
  return "/" + dir.join("/");
});

const genres = (await import(pathToFileURL(join(SRC, "content/genrePages.js")).href)).GENRE_KEYS;
const comparisons = (await import(pathToFileURL(join(SRC, "content/comparisonPages.js")).href)).COMPARISON_KEYS;
const posts = (await import(pathToFileURL(join(SRC, "content/posts.js")).href)).POSTS.map((p) => p.slug);
const nav = await import(pathToFileURL(join(SRC, "lib/navigation.js")).href);

const DYNAMIC_VALUES = { "/master/[genre]": genres, "/vs/[competitor]": comparisons, "/blog/[slug]": posts };
// Params that are runtime ids, not slug lists: any non-empty value is valid.
const FREE_FORM = new Set(["/shared/[jobId]", "/admin/users/[uid]", "/admin/analytics/sessions/[sessionId]"]);

function resolveRoute(path) {
  if (path === "") path = "/";
  if (path.length > 1) path = path.replace(/\/$/, "");
  if (routes.includes(path)) return true;
  for (const route of routes) {
    if (!route.includes("[")) continue;
    const rParts = route.split("/");
    const pParts = path.split("/");
    if (rParts.length !== pParts.length) continue;
    let ok = true;
    for (let i = 0; i < rParts.length; i++) {
      if (rParts[i].startsWith("[")) {
        if (!pParts[i]) ok = false;
        continue;
      }
      if (rParts[i] !== pParts[i]) ok = false;
    }
    if (!ok) continue;
    if (FREE_FORM.has(route)) return true;
    const values = DYNAMIC_VALUES[route];
    assert.ok(values, `no slug list registered for dynamic route ${route}`);
    const slug = pParts[rParts.findIndex((p) => p.startsWith("["))];
    if (values.includes(slug)) return true;
  }
  // Top-level dynamic landing pages (/song-key-finder etc.) are real
  // directories, so they are already in `routes`; nothing else is allowed.
  return false;
}

// ---- hash anchors ------------------------------------------------------
// Pages that declare an element id. Map route -> ids found in the page's
// source tree (page.js plus the client components in the same folder and
// shared components it renders).
function idsInSource() {
  const all = walk(SRC).filter((f) => /\.jsx?$/.test(f));
  const text = new Map(all.map((f) => [f, readFileSync(f, "utf8")]));
  const idsOf = (src) => new Set([...src.matchAll(/\bid=(?:"|\{?"|\{?')([\w-]+)["']/g)].map((m) => m[1]));
  const shared = new Set();
  for (const [f, src] of text) if (!/src[\\/]app[\\/]/.test(f) || /[\\/]components[\\/]/.test(f)) for (const id of idsOf(src)) shared.add(id);
  return { text, idsOf, shared };
}
const { text: SOURCES, idsOf, shared: SHARED_IDS } = idsInSource();

function anchorExists(path, hash) {
  if (!hash) return true;
  const dirOf = (route) => join(SRC, "app", route === "/" ? "" : route);
  const route = routes.find((r) => r === path) || path;
  const dir = dirOf(route);
  for (const [f, src] of SOURCES) if (f.startsWith(dir + sep) && idsOf(src).has(hash)) return true;
  return SHARED_IDS.has(hash);
}

// ---- extraction --------------------------------------------------------
const files = walk(SRC).filter((f) => /\.(js|jsx)$/.test(f) && !/[\\/]content[\\/]posts\.js$/.test(f));
files.push(join(SRC, "content/posts.js"));

const PATTERNS = [
  /\bhref=(?:"|'|\{\s*"|\{\s*')([^"'`]*)["']/g, // href="/x" and href={"/x"}
  /\bhref:\s*["']([^"'`]*)["']/g, // { href: "/x" }
  /\brouter\.(?:push|replace)\(\s*["']([^"'`]*)["']/g,
  /\bredirect\(\s*["']([^"'`]*)["']/g,
  /\bwindow\.location\.(?:href\s*=|assign\(|replace\()\s*["']([^"'`]*)["']/g,
  /\bSIGNUP_URL\s*=\s*["']([^"'`]*)["']/g,
];
// `${var}` templates are checked separately below.
const TEMPLATE = /\b(?:href=\{|href:\s*|router\.(?:push|replace)\()\s*`([^`]*)`/g;

function collect() {
  const found = []; // { file, line, target }
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const lineOf = (idx) => src.slice(0, idx).split("\n").length;
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) found.push({ file: relative(ROOT, f), line: lineOf(m.index), target: m[1] });
    }
    for (const m of src.matchAll(TEMPLATE)) found.push({ file: relative(ROOT, f), line: lineOf(m.index), target: m[1], template: true });
  }
  return found;
}

// A raw target is internal if it starts with "/" (not "//") or "#".
function parse(target, file) {
  if (!target || /^(https?:|mailto:|tel:|data:|blob:|\/\/)/.test(target)) return null;
  if (target.startsWith("#")) return { path: null, hash: target.slice(1), local: true };
  if (!target.startsWith("/")) return null;
  const u = new URL(target, "http://x");
  return { path: u.pathname, hash: u.hash.slice(1), search: u.search };
}

// Hrefs that are not page links: static assets and API calls.
const NON_PAGE = /^\/(artist-preset-template\.json|opengraph-image|robots\.txt|sitemap\.xml|llms\.txt|audio\/|worklets\/|api\/)/;
// href: fields in the admin analytics pages are API sub-paths, not links.
const API_PATH_FILES = [/[\\/]admin[\\/]analytics[\\/]/, /[\\/]network[\\/]/];

test("every static internal link resolves to a real route", () => {
  const bad = [];
  let checked = 0;
  for (const item of collect()) {
    if (API_PATH_FILES.some((re) => re.test(item.file)) && !/Link|href=/.test(item.file)) {
      // only skip API-style strings, real <Link href> in these files are checked below
    }
    if (item.template) {
      // /master/${g}, /blog/${slug}, /vs/${key}, /app?tab=${k}: validate the static prefix.
      const prefix = item.target.split("${")[0];
      if (!prefix.startsWith("/") || prefix === "/") continue;
      const base = prefix.split("?")[0].replace(/\/$/, "");
      const dynamicRoutes = routes.filter((r) => r.includes("["));
      const okPrefix = routes.includes(base) || dynamicRoutes.some((r) => r.startsWith(base + "/") || r.split("[")[0] === base + "/") || (item.target.startsWith("/${") );
      if (!okPrefix && !NON_PAGE.test(prefix)) bad.push(`${item.file}:${item.line} template ${item.target}`);
      continue;
    }
    const p = parse(item.target, item.file);
    if (!p) continue;
    if (p.local) {
      checked++;
      continue; // same-page anchors are covered by the anchor test
    }
    if (NON_PAGE.test(p.path)) continue;
    checked++;
    if (!resolveRoute(p.path)) bad.push(`${item.file}:${item.line} ${item.target}`);
  }
  assert.ok(checked > 50, `expected to check many links, got ${checked}`);
  assert.deepEqual(bad, []);
});

test("hash anchors point at ids that exist on the target page", () => {
  const bad = [];
  for (const item of collect()) {
    if (item.template) continue;
    const p = parse(item.target, item.file);
    if (!p || !p.hash) continue;
    if (p.local) {
      if (!SHARED_IDS.has(p.hash) && !idsOf(readFileSync(join(ROOT, item.file), "utf8")).has(p.hash) && !anchorExists("/", p.hash) && p.hash !== "main") {
        bad.push(`${item.file}:${item.line} #${p.hash}`);
      }
      continue;
    }
    if (!anchorExists(p.path, p.hash)) bad.push(`${item.file}:${item.line} ${item.target}`);
  }
  assert.deepEqual(bad, []);
});

test("the skip-link target #main exists on every public page layout", () => {
  for (const file of ["src/components/site/Page.jsx", "src/app/HomeClient.jsx"]) {
    assert.match(readFileSync(join(ROOT, file), "utf8"), /<main id="main"/, file);
  }
});

test("navigation config: every href resolves and every label key exists in en + sq", () => {
  const i18n = readFileSync(join(SRC, "lib/i18n.js"), "utf8");
  const bad = [];
  const lists = {
    PRIMARY_NAV: nav.PRIMARY_NAV,
    PRODUCT_NAV: nav.PRODUCT_NAV,
    RESOURCES_NAV: nav.RESOURCES_NAV,
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
      const p = parse(item.href, name);
      if (!p || !resolveRoute(p.path ?? "/")) bad.push(`${name}: ${item.href}`);
      else if (p.hash && !anchorExists(p.path, p.hash)) bad.push(`${name}: ${item.href} (missing anchor)`);
      if (item.labelKey) {
        const m = i18n.match(new RegExp(`"${item.labelKey.replace(/\./g, "\\.")}":\\s*\\{[^}]*?\\ben:[^}]*?\\bsq:`, "s"));
        if (!m) bad.push(`${name}: i18n key ${item.labelKey} missing en/sq`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("every public page is reachable from the header, footer or tools hub", () => {
  const reachable = new Set(
    [nav.PRIMARY_NAV, nav.PRODUCT_NAV, nav.RESOURCES_NAV, nav.LEGAL_NAV, nav.GENRE_NAV, nav.COMPARE_NAV, nav.PUBLIC_TOOLS, nav.STUDIO_GROUPS.flatMap((g) => g.tools)]
      .flat()
      .map((i) => i.href.split(/[?#]/)[0]),
  );
  const mustLink = [
    "/", "/tools", "/pricing", "/blog", "/lufs-meter", "/song-key-finder", "/bpm-finder", "/chord-detector",
    "/chord-progression-finder", "/mastering-loudness-targets", "/ai-mastering-online", "/privacy", "/terms", "/refund", "/newsletter",
  ];
  // "/" is the logo link in header and footer rather than a nav-list item.
  const missing = mustLink.filter((p) => p !== "/" && !reachable.has(p));
  assert.deepEqual(missing, []);
});

test("llms.txt and sitemap URLs resolve to routes", () => {
  const bad = [];
  const txt = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
  for (const m of txt.matchAll(/https:\/\/auralithforge\.app(\/[^\s)>"']*)?/g)) {
    const path = (m[1] || "/").replace(/[.,;:]+$/, "");
    if (NON_PAGE.test(path)) continue;
    if (!resolveRoute(path.split(/[?#]/)[0])) bad.push(`llms.txt ${path}`);
  }
  assert.deepEqual(bad, []);
});

test("sitemap.js only lists existing routes", async () => {
  // sitemap.js imports JSX (lib/seo), so read its static paths and slug-list
  // prefixes from source and resolve the lists the same way it does.
  const src = readFileSync(join(SRC, "app/sitemap.js"), "utf8");
  const bad = [];
  for (const m of src.matchAll(/\bpath:\s*"(\/[^"]*)"/g)) if (!resolveRoute(m[1])) bad.push(m[1]);
  const lists = {
    POSTS: posts.map((s) => `/blog/${s}`),
    GENRE_KEYS: genres.map((s) => `/master/${s}`),
    COMPARISON_KEYS: comparisons.map((s) => `/vs/${s}`),
    TOOL_LANDING_KEYS: (await import(pathToFileURL(join(SRC, "content/toolLandingPages.js")).href)).TOOL_LANDING_KEYS.map((s) => `/${s}`),
  };
  for (const [name, paths] of Object.entries(lists)) {
    assert.match(src, new RegExp(`\\b${name}\\b`), `sitemap.js no longer uses ${name}`);
    for (const p of paths) if (!resolveRoute(p)) bad.push(p);
  }
  assert.deepEqual(bad, []);
});

test("/app?tab=<key> deep links use real AppClient tab keys", () => {
  const app = readFileSync(join(SRC, "app/app/AppClient.jsx"), "utf8");
  const block = app.slice(app.indexOf("const TABS = ["), app.indexOf("const TOP_TABS"));
  const keys = new Set([...block.matchAll(/\bkey:\s*"([\w-]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size >= 5, "could not read TABS keys");
  const bad = [];
  for (const item of collect()) {
    if (item.template) continue;
    const m = item.target.match(/^\/app\?(?:[^"']*&)?tab=([\w-]+)/);
    if (m && !keys.has(m[1])) bad.push(`${item.file}:${item.line} tab=${m[1]}`);
  }
  assert.deepEqual(bad, []);
});
