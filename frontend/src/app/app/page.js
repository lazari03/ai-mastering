import AppClient from "./AppClient";
import { buildMetadata } from "@/lib/seo";

// Private, authenticated dashboard — no SEO value, and indexing it would
// just leak the app's internal shape to search engines.
export const metadata = buildMetadata({
  title: "Studio — Auralith Forge",
  description: "Your Auralith Forge mastering workspace.",
  path: "/app",
  noindex: true,
});

export default function AppPage() {
  return <AppClient />;
}
