import Link from "next/link";

import { buildMetadata } from "@/lib/seo";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";

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
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0b0d10] px-6 py-16 text-center text-white">
      <Link href="/" className="text-[11px] uppercase tracking-[0.16em] text-brass">
        Auralith Forge
      </Link>
      <h1 className="m-0 max-w-md font-[var(--font-title)] text-3xl sm:text-4xl">Get 10% off your first master</h1>
      <p className="m-0 max-w-sm text-sm text-zinc-400">
        Join the newsletter for occasional product updates and a discount code you can use right away. No spam,
        unsubscribe any time.
      </p>
      <div className="w-full max-w-sm text-left">
        <NewsletterWidget source="newsletter-page" size="lg" />
      </div>
      <Link href="/" className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
        ← Back to the app
      </Link>
    </main>
  );
}
