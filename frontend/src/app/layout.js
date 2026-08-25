import { Space_Grotesk, Inter } from "next/font/google";
import dynamic from "next/dynamic";

import Analytics from "@/components/Analytics";
import CookieBanner from "@/components/CookieBanner";
import { LanguageProvider } from "@/lib/i18n";
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS } from "@/lib/seo";
import "./globals.css";

// Dynamic, not a static import — AuthInit pulls in the full Firebase Auth
// SDK (initializeApp + getAuth, ~tens of KB) via authStore -> lib/firebase.
// A static import here bundles that into the shared chunk every single
// page pays for, including pure marketing pages (the homepage, blog,
// terms) that never read auth state at all. This way it code-splits into
// its own chunk, loaded after hydration instead of blocking the initial
// payload — /app and /login already show a loading state while auth
// resolves regardless, so a few hundred ms of extra delay before that
// resolves is invisible, not a regression.
const AuthInit = dynamic(() => import("./AuthInit"), { ssr: false });

const titleFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-title",
});

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

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
          <AuthInit />
          <Analytics />
          {children}
          <CookieBanner />
        </LanguageProvider>
      </body>
    </html>
  );
}
