import { POSTS } from "@/content/posts";
import { GENRE_KEYS } from "@/content/genrePages";
import { COMPARISON_KEYS } from "@/content/comparisonPages";
import { SITE_URL } from "@/lib/seo";

// Served automatically at /sitemap.xml by the Next.js App Router convention.
export default function sitemap() {
  // /ai-mastering-online is priority 0.9, just under the homepage — it's
  // the broad-intent hub page (unqualified "AI mastering online" /
  // "master a song online" searches), same tier of importance as the
  // homepage itself, unlike the narrower /master/[genre] and /vs/[competitor]
  // pages below it.
  const staticRoutes = ["/", "/ai-mastering-online", "/chord-detector", "/login", "/blog", "/terms", "/privacy", "/refund"].map(
    (path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : path === "/ai-mastering-online" ? 0.9 : path === "/chord-detector" ? 0.8 : 0.6,
    })
  );

  const postRoutes = POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.datePublished,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const genreRoutes = GENRE_KEYS.map((genre) => ({
    url: `${SITE_URL}/master/${genre}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const comparisonRoutes = COMPARISON_KEYS.map((competitor) => ({
    url: `${SITE_URL}/vs/${competitor}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...postRoutes, ...genreRoutes, ...comparisonRoutes];
}
