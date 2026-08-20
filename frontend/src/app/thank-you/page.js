import Link from "next/link";

import { buildMetadata } from "@/lib/seo";
import ThankYouTracker from "./ThankYouTracker";

export const metadata = buildMetadata({
  title: "Thank you",
  description: "Your purchase is confirmed.",
  path: "/thank-you",
  noindex: true,
});

export default function ThankYouPage({ searchParams }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-6 text-center text-white">
      <ThankYouTracker plan={searchParams?.plan} item={searchParams?.item} price={searchParams?.price} />
      <p className="m-0 text-3xl">✓</p>
      <h1 className="m-0 font-[var(--font-title)] text-3xl">Thanks — you&apos;re all set</h1>
      <p className="m-0 max-w-sm text-sm text-zinc-400">
        Your purchase went through. Whatever you bought — subscription, credits, or an add-on — is already active
        on your account.
      </p>
      <Link
        href="/app"
        className="mt-2 rounded-full bg-ember px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#100b08] hover:brightness-110"
      >
        Back to the app
      </Link>
    </main>
  );
}
