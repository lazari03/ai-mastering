import HomeClient from "./HomeClient";
import { buildMetadata, organizationJsonLd, JsonLd } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Auralith Forge — AI Audio Mastering Software with a Real DSP Engine",
  description:
    "Master your tracks online with an adaptive DSP engine — analysis-first EQ, compression, saturation, stereo imaging, and true-peak limiting. Free Standard tier, genre-aware presets, and saved artist mastering chains.",
  path: "/",
  keywords: [
    "master a song online free",
    "AI mastering software",
    "professional audio mastering",
    "online mastering studio",
    "genre mastering presets",
  ],
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <HomeClient />
    </>
  );
}
