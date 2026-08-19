import Link from "next/link";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-6 text-center text-white">
      <p className="m-0 font-[var(--font-title)] text-[15px] uppercase tracking-[0.2em] text-brass">404</p>
      <h1 className="m-0 font-[var(--font-title)] text-3xl">This page doesn&apos;t exist</h1>
      <p className="m-0 max-w-sm text-sm text-zinc-400">
        The link might be broken, or the page may have moved. Let&apos;s get you back on track.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-ember px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#100b08] hover:brightness-110"
        >
          Go home
        </Link>
        <Link
          href="/app"
          className="rounded-full border border-brass/50 bg-brass/[0.1] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-brass hover:bg-brass/20"
        >
          Open the app
        </Link>
      </div>
    </main>
  );
}
