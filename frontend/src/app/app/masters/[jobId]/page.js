import { Suspense } from "react";

import AppClient from "../../AppClient";
import { buildMetadata } from "@/lib/seo";
import { LoadingBlock } from "@/components/ui/Spinner";

// Private, authenticated dashboard — no SEO value, and indexing it would
// just leak the app's internal shape (and per-user job IDs) to search
// engines. Same reasoning as /app itself.
export const metadata = buildMetadata({
  title: "Master — Auralith Forge",
  description: "Your Auralith Forge mastering workspace.",
  path: "/app",
  noindex: true,
});

// A real, bookmarkable/refreshable URL for one finished master — see
// MasterResultView.jsx for why that matters (a page refresh here
// re-fetches from the backend instead of losing in-memory state). Auth
// and per-user ownership are enforced server-side (requireAuth + the
// jobs subcollection being scoped to the caller's own uid, see
// jobsService.js) — this page itself does no gating of its own beyond
// what AppClient already does for every /app route (redirect to /login
// if not signed in). Suspense boundary required by AppClient's
// useSearchParams() call, same as /app/page.js.
export default function MasterDetailPage({ params }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center">
          <LoadingBlock />
        </main>
      }
    >
      <AppClient initialJobId={params.jobId} />
    </Suspense>
  );
}
