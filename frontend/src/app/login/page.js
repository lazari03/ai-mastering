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
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
