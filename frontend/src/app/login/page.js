import { Suspense } from "react";

import LoginClient from "./LoginClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Sign In — Auralith Forge AI Mastering",
  description: "Sign in or create a free account to start mastering tracks with Auralith Forge's adaptive DSP engine.",
  path: "/login",
  keywords: ["AI mastering sign up", "mastering studio login"],
});

// Suspense boundary required by LoginClient's useSearchParams() (reads
// ?reason=session_expired) — Next.js bails out of static generation for
// that hook otherwise.
export default function LoginPage() {
  return (
    // The form needs the query string (client-only), so the server renders a
    // minimal shell with the page's heading instead of nothing at all.
    <Suspense
      fallback={
        <main id="main" className="flex min-h-screen items-center justify-center px-4">
          <h1 className="m-0 font-[var(--font-title)] text-[28px] font-semibold text-text-primary">Sign in to Auralith Forge</h1>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
