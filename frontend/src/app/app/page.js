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

// Was statically prerendered by default, which is also what was emitting
// Cache-Control: s-maxage=31536000 (1 year) on this page — fine for
// Vercel's edge, which purges on deploy; wrong for a plain self-hosted
// reverse proxy with no such purge mechanism, and wrong on its own
// terms besides: this is a private, per-user, authenticated shell with
// zero SEO/caching value, it never had any business being cached at all.
// force-dynamic renders it fresh per request instead — content is
// entirely client-fetched after mount anyway, so this costs nothing
// perceptible and fixes "still see the old app shell after a deploy" at
// the source instead of fighting the header downstream in Caddy.
export const dynamic = "force-dynamic";

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
