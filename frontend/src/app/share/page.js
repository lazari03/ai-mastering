import { buildMetadata } from "@/lib/seo";
import SharedMasterClient from "../shared/[jobId]/SharedMasterClient";

export const metadata = buildMetadata({
  title: "Shared master",
  description: "Download a mastered track shared with you.",
  path: "/share",
  noindex: true,
});

// Public share-link landing page: /share#<token>. The token is read
// client-side from the URL fragment (never sent to any server by the
// browser) and presented to the API in a header. No sign-in involved.
export default function SharePage() {
  return <SharedMasterClient fromFragment />;
}
