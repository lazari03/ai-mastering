import Link from "next/link";

import Footer from "@/components/Footer";

export const LAST_UPDATED = "August 16, 2026";

export default function LegalPage({ title, children }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-8 sm:px-6">
        <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
          ← Back to home
        </Link>

        <h1 className="mt-5 font-[var(--font-title)] text-3xl text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-zinc-300">{children}</div>
      </main>
      <Footer />
    </>
  );
}
