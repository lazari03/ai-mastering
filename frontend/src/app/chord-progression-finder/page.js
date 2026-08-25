import { TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { buildMetadata, SITE_NAME } from "@/lib/seo";
import ToolLandingPage from "@/components/marketing/ToolLandingPage";

const SLUG = "chord-progression-finder";
const page = TOOL_LANDING_PAGES[SLUG];

export const metadata = buildMetadata({
  title: `${page.headline} | ${SITE_NAME}`,
  description: page.description,
  path: `/${SLUG}`,
  keywords: page.keywords,
});

export default function ChordProgressionFinderPage() {
  return <ToolLandingPage slug={SLUG} page={page} />;
}
