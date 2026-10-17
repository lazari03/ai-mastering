// Single source of truth for site navigation. The header (desktop bar,
// Studio panel, mobile menu), the footer and the admin tab strip all render
// from these lists, and tests/internal-links.test.mjs asserts every href
// here resolves to a real App Router route. To add or move a page, change it
// here once - never hardcode a nav href in a component.
//
// Labels are i18n keys (lib/i18n.js, en + sq), except tool and genre/vs names,
// which are already bilingual objects in lib/studio.js and the content files.
// Relative .js imports (not "@/") so the node:test link guard can load this.
import { GENRE_KEYS, GENRE_PAGES } from "../content/genrePages.js";
import { COMPARISON_KEYS, COMPARISON_PAGES } from "../content/comparisonPages.js";
import { STUDIO_GROUPS } from "./studio.js";

export { STUDIO_GROUPS };

export const HOME = "/";
export const SIGNIN = "/login";
export const SIGNUP = "/login?mode=signup";
export const APP = "/app";

// Header bar links (desktop) and the chip row in the mobile menu.
export const PRIMARY_NAV = [
  { href: "/tools", labelKey: "nav.allTools" },
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/blog", labelKey: "nav.blog" },
  { href: "/#faq", labelKey: "nav.faq" },
  { href: "/#contact", labelKey: "nav.contact" },
];

// Free public analysis tools (same list the Studio menu shows under Analyze).
export const PUBLIC_TOOLS = STUDIO_GROUPS.find((g) => g.key === "analyze").tools;

export const PRODUCT_NAV = [
  { href: "/ai-mastering-online", labelKey: "footer.link.aiMasteringOnline" },
  { href: "/tools", labelKey: "footer.link.allTools" },
  { href: "/pricing", labelKey: "footer.link.pricing" },
  { href: SIGNUP, labelKey: "footer.link.openApp" },
];

// /master/<genre>, one per GENRE_PAGES entry.
export const GENRE_NAV = GENRE_KEYS.map((key) => ({ key, href: `/master/${key}`, label: GENRE_PAGES[key].label }));

// /vs/<competitor>, one per COMPARISON_PAGES entry.
export const COMPARE_NAV = COMPARISON_KEYS.map((key) => ({ key, href: `/vs/${key}`, label: COMPARISON_PAGES[key].label }));

export const RESOURCES_NAV = [
  { href: "/blog", labelKey: "nav.blog" },
  { href: "/mastering-loudness-targets", labelKey: "footer.link.loudnessTargets" },
  { href: "/newsletter", labelKey: "footer.link.newsletter" },
  { href: "/#faq", labelKey: "footer.link.faq" },
];

export const LEGAL_NAV = [
  { href: "/terms", labelKey: "footer.legal.terms" },
  { href: "/privacy", labelKey: "footer.legal.privacy" },
  { href: "/refund", labelKey: "footer.legal.refund" },
  { href: "/#contact", labelKey: "footer.link.contact" },
];

// Admin tab strip (icons are attached by components/admin/AdminShell.jsx).
export const ADMIN_NAV = [
  { href: "/admin/analytics/behavior", labelKey: "admin.nav.behavior" },
  { href: "/admin/analytics", labelKey: "admin.nav.overview" },
  { href: "/admin/analytics/live", labelKey: "admin.nav.live" },
  { href: "/admin/analytics/sessions", labelKey: "admin.nav.sessions" },
  { href: "/admin/analytics/funnel", labelKey: "admin.nav.funnel" },
  { href: "/admin/analytics/acquisition", labelKey: "admin.nav.acquisition" },
  { href: "/admin/analytics/pages", labelKey: "admin.nav.pages" },
  { href: "/admin/analytics/seo", labelKey: "admin.nav.seo" },
  { href: "/admin/analytics/sales", labelKey: "admin.nav.sales" },
  { href: "/admin/analytics/errors", labelKey: "admin.nav.errors" },
  { href: "/admin/analytics/retention", labelKey: "admin.nav.retention" },
  { href: "/admin/users", labelKey: "admin.nav.users" },
];

// Not-found page shortcuts.
export const NOT_FOUND_LINKS = {
  actions: [
    { href: HOME, labelKey: "notFound.home" },
    { href: "/tools", labelKey: "notFound.tools" },
    { href: "/pricing", labelKey: "notFound.pricing" },
  ],
  tools: [
    { href: "/ai-mastering-online", labelKey: "footer.link.aiMasteringOnline" },
    { href: "/chord-detector", labelKey: "footer.link.chordDetector" },
    { href: "/lufs-meter", labelKey: "footer.link.lufsMeter" },
  ],
  read: [
    { href: "/blog", labelKey: "notFound.guides" },
    { href: "/mastering-loudness-targets", labelKey: "footer.link.loudnessTargets" },
  ],
};

// Active-state rule shared by every nav: hash links (/#faq) are never
// "current"; everything else matches its own path or a sub-path.
export function isActiveHref(pathname, href) {
  if (!pathname || href.startsWith("/#")) return false;
  const path = href.split(/[?#]/)[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
