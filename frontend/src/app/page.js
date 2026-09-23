import HomeClient from "./HomeClient";
import { buildMetadata, organizationJsonLd, faqJsonLd, JsonLd } from "@/lib/seo";
import { HOME_FAQ } from "@/content/homeFaq";

export const metadata = buildMetadata({
  title: "Master Your Music Online — AI Audio Mastering with a Real DSP Engine | Auralith Forge",
  description:
    "Master your tracks online with an adaptive DSP engine — analysis-first EQ, compression, saturation, stereo imaging, and true-peak limiting. It measures your mix first, corrects only what needs it and preserves the rest. Free trial, genre-aware targets, and saved artist mastering chains.",
  path: "/",
  keywords: [
    "mastering online",
    "master a song online free",
    "online audio mastering",
    "AI mastering software",
    "professional audio mastering",
    "online mastering studio",
    "genre mastering presets",
  ],
});

// Same text the visible FAQ renders (content/homeFaq.js feeds both), so the
// FAQPage structured data can't drift from what's on the page.
const FAQ_ITEMS = HOME_FAQ.map(({ q, a }) => ({ question: q, answer: a }));

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />
      <HomeClient />
    </>
  );
}
