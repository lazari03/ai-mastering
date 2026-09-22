import Link from "next/link";

import Footer from "@/components/Footer";
import SiteHeader from "@/components/marketing/SiteHeader";
import SectionHeading from "@/components/marketing/SectionHeading";
import { POSTS } from "@/content/posts";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Mastering Guides & Notes — Auralith Forge",
  description: "Plain-language writing on how AI mastering actually works, what it automates, and how studios build repeatable mastering chains.",
  path: "/blog",
  keywords: ["audio mastering blog", "mastering guides", "how mastering works"],
});

// Migrated off the old dark palette (text-white / text-zinc-400 /
// bg-black/20 on what is now a cream page — i.e. unreadable) onto the
// same light tokens and bezel construction the homepage uses. This also
// gains the shared SiteHeader: previously the only navigation here was a
// bare "← Back to home" link, which is a dead end for someone arriving
// from search with no way into the product.
export default function BlogIndexPage() {
  return (
    <>
    <main className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-4 sm:px-6">
      <SiteHeader />

      <div className="mt-14">
        <SectionHeading
          eyebrow="Guides"
          title="Mastering guides & notes"
          subtitle="How the engine actually works, what it does (and doesn't) automate, and how to build a repeatable mastering workflow for real releases."
        />
      </div>

      <div className="mt-10 flex flex-col gap-3">
        {POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-[1.5rem] bg-black/[0.035] p-7 ring-1 ring-inset ring-black/[0.05] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.055]"
          >
            <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">{post.readingTime}</p>
            <h2 className="mt-3 font-[var(--font-title)] text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary">
              {post.title}
            </h2>
            <p className="mt-2.5 text-[15px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
              {post.description}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary">
              Read the guide
              <span
                aria-hidden="true"
                className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
    <Footer />
    </>
  );
}
