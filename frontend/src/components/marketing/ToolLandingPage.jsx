import AnalyzeToolPage from "@/components/site/AnalyzeToolPage";
import { CHORD_DETECTOR_RELATED_GENRES } from "@/lib/internalLinks";
import { GENRE_PAGES } from "@/content/genrePages";
import { TOOL_LANDING_KEYS } from "@/content/toolLandingPages";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

// /song-key-finder, /bpm-finder, /chord-progression-finder — each page.js
// supplies its content object from content/toolLandingPages.js; the layout
// is the shared AnalyzeToolPage (same as /chord-detector). The live tool now
// sits on the page itself instead of linking away to /chord-detector.
//
// SEO continuity: the <title>/description stay in page.js untouched, the
// old hero title stays on the page as the H2 over the original intro, and
// the Service + FAQPage schemas and every previous internal link are kept.
const FOCUS = { "song-key-finder": "key", "bpm-finder": "bpm", "chord-progression-finder": "chords" };

export default function ToolLandingPage({ slug, page }) {
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.label,
    serviceType: "Automatic audio analysis",
    provider: { "@type": "Organization", name: SITE_NAME },
    description: page.description,
    url: absoluteUrl(`/${slug}`),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Free, unlimited detection.",
    },
  };

  return (
    <AnalyzeToolPage
      slug={slug}
      toolKey={slug}
      analyticsSlug={slug}
      breadcrumbName={page.label}
      eyebrow={`${page.heroCaption} · Free`}
      h1={page.h1}
      lead={page.lead}
      focus={FOCUS[slug]}
      toolLabel={page.label}
      about={{ title: page.heroTitle, paragraphs: [page.intro, "Completely free — no trial limit, no card, no subscription. Detection is free for every song, always."] }}
      steps={page.howItWorks}
      education={page.education}
      faq={page.faq}
      nextLinks={[
        {
          title: page.crossLinkLabel,
          links: CHORD_DETECTOR_RELATED_GENRES.map((g) => ({ href: `/master/${g}`, label: `How ${GENRE_PAGES[g].label.toLowerCase()} mastering adapts to your mix` })),
        },
      ]}
      relatedKeys={["chord-detector", ...TOOL_LANDING_KEYS.filter((k) => k !== slug), "lufs-meter"]}
      schemas={[serviceJsonLd]}
      cta={{ title: `Analyze your track — free`, body: "Key, BPM and chords from one upload. Master it when the mix is ready.", primary: "Upload a track" }}
    />
  );
}
