import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";

import Analytics from "@/components/Analytics";
import CookieBanner from "@/components/CookieBanner";
import PromoPopup from "@/components/marketing/PromoPopup";
import ClientOnlyMounts from "./ClientOnlyMounts";
import { LanguageProvider } from "@/lib/i18n";
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS } from "@/lib/seo";
import "./globals.css";

// Display face. A wide geometric grotesk carries the massive headline
// sizes this layout leans on without the headline turning into texture,
// which is what happens when body-proportioned type is scaled to 80px.
const titleFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-title",
});

// Body face. Inter — the default on roughly every AI-generated
// marketing page — is out; Plus Jakarta Sans holds the same legibility
// at small sizes while having actual character in its terminals and
// its single-storey 'a'. Five weights, not two, so hierarchy can be
// carried by weight (400/500/600) instead of only by size and color.
const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

// Route-segment config, inherited by every page under this root layout:
// without it, fully-static pages (the homepage, blog, tools, legal — all
// the marketing surface) get Next.js's default Cache-Control of
// s-maxage=31536000 (ONE YEAR), and Cloudflare in front honors s-maxage —
// measured live as cf-cache-status: HIT on year-cached homepage HTML,
// meaning a redeploy's changes could take arbitrarily long to reach
// visitors. Four attempts at overriding the header downstream in Caddy
// all failed empirically (see the Caddyfile-revert commit); this is the
// at-the-source fix, same principle as /app's force-dynamic: change what
// Next itself emits. revalidate=300 turns those pages ISR — Next emits
// s-maxage=300, stale-while-revalidate instead, so the edge still absorbs
// traffic bursts but a deploy's changes reach visitors within ~5 minutes.
// Routes that declare their own config (the /app shell is force-dynamic)
// are unaffected.
export const revalidate = 300;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  // Category first, brand second. This is only the fallback for routes
  // that don't export their own metadata (every marketing page does, via
  // buildMetadata) — but a title that leads with the brand name only helps
  // people already searching for the brand, and the whole point of these
  // pages is to be found by people searching "online audio mastering" who
  // have never heard of it. Template is `%s` so page titles override
  // wholesale rather than getting a brand suffix appended twice.
  title: { default: `Online Audio Mastering — AI Mastering Software | ${SITE_NAME}`, template: `%s` },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  robots: { index: true, follow: true },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${titleFont.variable} ${bodyFont.variable}`}>
        <LanguageProvider>
          <ClientOnlyMounts />
          <Analytics />
          {children}
          <CookieBanner />
          <PromoPopup />
          {/* Fixed, pointer-events-none, one composite layer — see
              .grain-overlay in globals.css. Last in <body> so it paints
              above content without needing a z-index of its own. */}
          <div className="grain-overlay" aria-hidden="true" />
        </LanguageProvider>
      </body>
    </html>
  );
}
