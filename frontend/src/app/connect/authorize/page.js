import { Suspense } from "react";

import AuthorizeClient from "./AuthorizeClient";
import { buildMetadata } from "@/lib/seo";

// OAuth consent for connecting Auralith Forge to ChatGPT (MCP). Reached only
// by redirect from the API's /authorize endpoint (backend-node src/mcp/), so
// it has nothing to rank: noindex, and not in sitemap.js.
export const metadata = buildMetadata({
  title: "Connect Auralith Forge — Authorize",
  description: "Allow ChatGPT to use your Auralith Forge account to master tracks.",
  path: "/connect/authorize",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default function ConnectAuthorizePage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="flex min-h-screen items-center justify-center px-4">
          <h1 className="m-0 font-[var(--font-title)] text-[28px] font-semibold text-text-primary">Connect Auralith Forge</h1>
        </main>
      }
    >
      <AuthorizeClient />
    </Suspense>
  );
}
