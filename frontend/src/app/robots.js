import { SITE_URL } from "@/lib/seo";

// Served automatically at /robots.txt by the Next.js App Router convention.
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /app is the authenticated dashboard — no content for a crawler to
        // index, and no reason to advertise its internal routes.
        disallow: ["/app"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
