import { POSTS } from "@/content/posts";
import { GENRE_KEYS } from "@/content/genrePages";
import { SITE_URL } from "@/lib/seo";

// Served automatically at /sitemap.xml by the Next.js App Router convention.
export default function sitemap() {
  const staticRoutes = ["/", "/login", "/blog", "/terms", "/privacy", "/refund"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));

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

  return [...staticRoutes, ...postRoutes, ...genreRoutes];
}
