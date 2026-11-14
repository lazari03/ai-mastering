import { TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { buildMetadata, SITE_NAME } from "@/lib/seo";
import ToolLandingPage from "@/components/marketing/ToolLandingPage";

const SLUG = "chord-progression-finder";
const page = TOOL_LANDING_PAGES[SLUG];

export const metadata = buildMetadata({
  title: `${page.headline} | ${SITE_NAME}`,
  // Search-result snippet, kept under 160 characters; page.description is
  // the longer on-page/structured-data copy.
  description: "Upload a song and get its chord progression, section by section, for learning by ear or charting a cover. Free and unlimited, no card required.",
  path: `/${SLUG}`,
  keywords: page.keywords,
});

export default function ChordProgressionFinderPage() {
  return <ToolLandingPage slug={SLUG} page={page} />;
}
