// Central SEO constants — every page's metadata pulls from here so title
// format, domain, and default keywords stay consistent instead of each
// page inventing its own.
//
// SITE_URL is a placeholder until a real domain is bought — update
// NEXT_PUBLIC_SITE_URL in .env.local/.env once you have one, sitemap.js,
// robots.js, and every page's canonical/OG URLs all read from it.
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
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      category: "Standard tier — free adaptive AI mastering",
    },
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
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
