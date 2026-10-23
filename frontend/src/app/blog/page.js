import Link from "next/link";
import Image from "next/image";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, CtaBand, PageHero, PageShell } from "@/components/site/Page";
import { POSTS } from "@/content/posts";
import { buildMetadata } from "@/lib/seo";
import { CTA } from "@/lib/internalLinks";

export const metadata = buildMetadata({
  title: "Mastering Guides & Notes — Auralith Forge",
  description: "Plain-language writing on how AI mastering actually works, what it automates, and how studios build repeatable mastering chains.",
  path: "/blog",
  keywords: ["audio mastering blog", "mastering guides", "how mastering works"],
});

export default function BlogIndexPage() {
  return (
    <PageShell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/blog" }]} />
      <PageHero
        eyebrow="Guides"
        title="Mastering guides & notes"
        lead="How the engine actually works, what it does (and doesn't) automate, and how to build a repeatable mastering workflow for real releases."
      />

      <ul className="m-0 mt-12 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border-subtle bg-white/55 transition duration-300 hover:border-text-primary/30 hover:bg-white"
            >
              <span className="relative block aspect-[16/10] w-full overflow-hidden">
                <Image src={post.image} alt="" fill sizes="(max-width: 768px) 100vw, 380px" className="object-cover transition duration-700 group-hover:scale-[1.03]" />
              </span>
              <span className="flex flex-1 flex-col p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">{post.readingTime}</span>
                <h2 className="mt-3 font-[var(--font-title)] text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary">
                  {post.title}
                </h2>
                <span className="mt-2.5 text-[15px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
                  {post.description}
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-text-primary">
                  Read the guide
                  <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <RelatedTools keys={["adaptive-mastering", "lufs-meter", "chord-detector", "song-key-finder"]} />

      <CtaBand
        title="Put the theory on your own track"
        body="3 full masters free, no card required."
        primary={{ href: CTA.signup, label: "Master a track free" }}
        secondary={{ href: "/mastering-loudness-targets", label: "Loudness targets by genre" }}
      />
    </PageShell>
  );
}
