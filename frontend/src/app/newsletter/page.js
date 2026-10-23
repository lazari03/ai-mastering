import { buildMetadata } from "@/lib/seo";
import NewsletterPageClient from "./NewsletterPageClient";

// Deliberately not indexed and not in sitemap.js — this page exists for
// direct/paid links (an ad, a bio link, a QR code) that all point at the
// same clean signup surface, not for organic search to find. The footer
// widget (Footer.jsx, on nearly every marketing page) is the indexed,
// discoverable path to the same subscribe flow; this is the standalone
// one for traffic that's already been told where to go.
export const metadata = buildMetadata({
  title: "Get 10% Off",
  description: "Join the newsletter and get a 10% discount code.",
  path: "/newsletter",
  noindex: true,
});

export default function NewsletterPage() {
  return <NewsletterPageClient />;
}
