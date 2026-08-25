import Link from "next/link";

import Footer from "@/components/Footer";
import { POSTS } from "@/content/posts";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Mastering Guides & Notes — Auralith Forge",
  description: "Plain-language writing on how AI mastering actually works, what it automates, and how studios build repeatable mastering chains.",
  path: "/blog",
  keywords: ["audio mastering blog", "mastering guides", "how mastering works"],
});

export default function BlogIndexPage() {
  return (
    <>
    <main className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-8 sm:px-6">
      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <h1 className="mt-5 font-[var(--font-title)] text-3xl text-white sm:text-4xl">Mastering Guides & Notes</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
        How the engine actually works, what it does (and doesn&apos;t) automate, and how to build a repeatable
        mastering workflow for real releases.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:border-white/25"
          >
            <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-500">{post.readingTime}</p>
            <h2 className="mt-2 font-[var(--font-title)] text-xl text-white group-hover:text-brass">{post.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{post.description}</p>
          </Link>
        ))}
      </div>
    </main>
    <Footer />
    </>
  );
}
