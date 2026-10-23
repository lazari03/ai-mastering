import HomeClient from "./HomeClient";
import { buildMetadata, organizationJsonLd, websiteJsonLd, brandJsonLd, faqJsonLd, JsonLd } from "@/lib/seo";
import { HOME_FAQ } from "@/content/homeFaq";

// Title/description lead with the "free online mastering" cluster — the
// highest-volume query family in Google Trends (Oct 2026: "free online
// mastering", "online mastering free", "free mastering online", "free
// mastering", "mastering online free" all at 98–100 relative interest,
// vs 39 for "ai mastering"). Honest claim: 3 full masters + unlimited
// 30-second previews are free, no card — see content/homeFaq.js.
export const metadata = buildMetadata({
  title: "Free Online Mastering — Adaptive DSP Audio Mastering | Auralith Forge",
  description:
    "Free online mastering: 3 full-length masters plus unlimited 30-second previews, no card required. An adaptive DSP engine measures your mix first, then applies EQ, compression and true-peak limiting only where your track needs it.",
  path: "/",
  keywords: [
    "free online mastering",
    "online mastering free",
    "free mastering online",
    "free mastering",
    "mastering online free",
    "free online audio mastering",
    "online audio mastering",
    "online song mastering",
    "mastering music online",
    "master a song online free",
  ],
});

// Same text the visible FAQ renders (content/homeFaq.js feeds both), so the
// FAQPage structured data can't drift from what's on the page.
const FAQ_ITEMS = HOME_FAQ.map(({ q, a }) => ({ question: q, answer: a }));

export default function HomePage() {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={brandJsonLd()} />
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />
      <HomeClient />
    </>
  );
}
