import { buildMetadata } from "@/lib/seo";
import SharedMasterClient from "./SharedMasterClient";

export const metadata = buildMetadata({
  title: "Shared master",
  description: "Download a mastered track shared with you.",
  path: "/shared",
  noindex: true,
});

// Next.js 15+ passes params/searchParams as Promises; reading them
// synchronously yields undefined (every share link showed "missing its
// access token"). Public page — no auth involved, the ?token= is the
// only credential.
export default async function SharedMasterPage({ params, searchParams }) {
  const { jobId } = await params;
  const { token } = (await searchParams) || {};
  return <SharedMasterClient jobId={jobId} token={typeof token === "string" ? token : ""} />;
}
