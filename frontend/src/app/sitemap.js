import { POSTS } from "@/content/posts";
import { GENRE_KEYS } from "@/content/genrePages";
import { COMPARISON_KEYS } from "@/content/comparisonPages";
import { TOOL_LANDING_KEYS } from "@/content/toolLandingPages";
import { SITE_URL } from "@/lib/seo";

// Served automatically at /sitemap.xml by the Next.js App Router convention.
//
// Coverage is every public route under src/app except the three that set
// `noindex: true` and are disallowed in robots.js (/app, /thank-you,
// /shared/[jobId]), plus /login — a bare auth form with no content, which
// has nothing to rank for and would only compete with the homepage on
// brand queries. Everything else is here:
//
//   /                          HomeClient
//   /ai-mastering-online       broad-intent hub
//   /chord-detector            umbrella tool page
//   /song-key-finder           }
//   /bpm-finder                } TOOL_LANDING_KEYS
//   /chord-progression-finder  }
//   /master/<genre>            GENRE_KEYS (8)
//   /vs/<competitor>           COMPARISON_KEYS
//   /blog + /blog/<slug>       POSTS
//   /terms /privacy /refund    legal
//
// If you add a public route, add it here — nothing enforces this
// automatically, and an unlisted page is one an AI/search crawler only
// finds if something links to it.

// Evergreen marketing pages have no per-page modified date to draw on, so
// they share one constant. Deliberately NOT `new Date()`: that stamps
// today onto every URL on every build, which tells a crawler the entire
// site changed on every deploy — a signal that gets discounted as noise
// once it's obviously untrue. Bump this by hand when the copy in
// src/content/*.js or a landing page actually changes.
const CONTENT_LAST_MODIFIED = "2026-08-25";

export default function sitemap() {
  // /ai-mastering-online is priority 0.9, just under the homepage — it's
  // the broad-intent hub page (unqualified "AI mastering online" /
  // "master a song online" searches), same tier of importance as the
  // homepage itself, unlike the narrower /master/[genre] and /vs/[competitor]
  // pages below it.
  const staticRoutes = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/ai-mastering-online", priority: 0.9, changeFrequency: "monthly" },
    { path: "/chord-detector", priority: 0.8, changeFrequency: "monthly" },
    // Listed above the legal pages because it gains entries over time;
    // the individual posts follow from POSTS below.
    { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/refund", priority: 0.3, changeFrequency: "yearly" },
  ].map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency,
    priority,
  }));

  const postRoutes = POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.datePublished,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const genreRoutes = GENRE_KEYS.map((genre) => ({
    url: `${SITE_URL}/master/${genre}`,
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const comparisonRoutes = COMPARISON_KEYS.map((competitor) => ({
    url: `${SITE_URL}/vs/${competitor}`,
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const toolLandingRoutes = TOOL_LANDING_KEYS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...postRoutes, ...genreRoutes, ...comparisonRoutes, ...toolLandingRoutes];
}
