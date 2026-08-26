import { Suspense } from "react";

import AppClient from "./AppClient";
import { buildMetadata } from "@/lib/seo";
import { LoadingBlock } from "@/components/ui/Spinner";

// Private, authenticated dashboard — no SEO value, and indexing it would
// just leak the app's internal shape to search engines.
export const metadata = buildMetadata({
  title: "Studio — Auralith Forge",
  description: "Your Auralith Forge mastering workspace.",
  path: "/app",
  noindex: true,
});

// Suspense boundary required by useSearchParams() inside AppClient (reads
// ?tab=… for deep-linking into a specific tab, and ?job=… for the result
// view — see AppClient.jsx's jobIdParam comment) — Next.js bails out of
// static generation for that hook otherwise.
export default function AppPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center">
          <LoadingBlock />
        </main>
      }
    >
      <AppClient />
    </Suspense>
  );
}
