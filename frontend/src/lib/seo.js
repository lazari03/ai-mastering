// Central SEO constants — every page's metadata pulls from here so title
// format, domain, and default keywords stay consistent instead of each
// page inventing its own.
//
// The "https://auralithforge.app" fallback below is for LOCAL DEV ONLY —
// it happens to also be the real production domain, which is exactly what
// made a missing NEXT_PUBLIC_SITE_URL in production invisible: sitemap.xml,
// robots.txt, and every page's canonical/OG URLs would silently render
// correct-looking URLs against a hardcoded string instead of the real env
// var, with nothing to notice it by. Fails the build instead, server-side
// only (this module has no client-side importers today, but a throw at
// import time would crash every page load in the browser rather than fail
// a build if that ever changed — restricting to the server keeps this a
// build-time check, not a runtime landmine). Set NEXT_PUBLIC_SITE_URL in
// the environment the build reads from (frontend/.env.example) — note
// docker-compose.yml's own `${NEXT_PUBLIC_SITE_URL:-https://auralithforge.app}`
// default on the frontend build args means this won't fire via that
// deploy path unless that default is also removed; it's the backstop for
// building directly with `next build` outside docker-compose (Vercel, a
// different CI pipeline, etc).
if (typeof window === "undefined" && process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL is not set in a production build. Set it in the environment this build reads from " +
      "(see frontend/.env.example) — sitemap.xml, robots.txt, and every page's canonical/OG URLs depend on it " +
      "being the real domain, not a hardcoded fallback that only happens to match today."
  );
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://auralithforge.app";
export const SITE_NAME = "Auralith Forge";

export const DEFAULT_DESCRIPTION =
  "AI-powered online audio mastering with a real adaptive DSP engine — EQ, multiband compression, saturation, true-peak limiting, and genre-aware presets. Master a track in minutes, not days.";

export const DEFAULT_KEYWORDS = [
  "AI audio mastering",
  "online audio mastering",
  "automated mastering software",
  "adaptive DSP mastering engine",
  "true peak limiter online",
  "mastering presets",
  "stem separation mastering",
  "master a song online",
  "AI mastering studio",
  "digital signal processing mastering",
];

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function buildMetadata({ title, description, path = "/", keywords = [], noindex = false, image }) {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    keywords: [...new Set([...keywords, ...DEFAULT_KEYWORDS])],
    alternates: { canonical: url },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

// Organization + WebSite JSON-LD, rendered once in the root layout — tells
// search engines and LLM crawlers what the site is in a machine-readable
// way, independent of the visual page content.
//
// offers is a real AggregateOffer across all 3 plans (Free/Studio/
// All-Access), not just the free tier — matches lib/pricing.js exactly.
// Previously said priceCurrency: "USD" while every actual price on the
// site is in EUR — mismatched structured data is exactly the kind of
// thing that erodes trust signals (and can trigger a manual review),
// worth catching regardless of how minor it looks.
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: "19.99",
      priceCurrency: "EUR",
      offerCount: "3",
    },
  };
}

// FAQPage JSON-LD — real Q&A content (see frontend/src/lib/i18n.js
// "faq.*" keys, the exact same text rendered on the homepage FAQ
// section), not written separately/fabricated for SEO. This is what
// makes the homepage eligible for a rich FAQ snippet in search results —
// free, no ads, no backlinks required, just structured markup of content
// that's already there.
export function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export function articleJsonLd({ title, description, path, datePublished, image }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: absoluteUrl(path),
    datePublished,
    dateModified: datePublished,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    image: image ? [image] : undefined,
    mainEntityOfPage: absoluteUrl(path),
  };
}

export function JsonLd({ data }) {
  // JSON.stringify doesn't escape "</script>" — a value containing that
  // sequence would break out of the tag. Nothing here is user-controlled
  // today (site config + hardcoded blog post text), but escaping "<" is
  // free insurance against that ever changing later.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
