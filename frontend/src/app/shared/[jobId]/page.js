import { buildMetadata } from "@/lib/seo";
import SharedMasterClient from "./SharedMasterClient";

export const metadata = buildMetadata({
  title: "Shared master",
  description: "Download a mastered track shared with you.",
  path: "/shared",
  noindex: true,
});

export default function SharedMasterPage({ params, searchParams }) {
  return <SharedMasterClient jobId={params.jobId} token={searchParams?.token || ""} />;
}
