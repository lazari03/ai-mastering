import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import Footer from "@/components/Footer";
import SiteHeader from "@/components/marketing/SiteHeader";
import { POSTS, getPostBySlug } from "@/content/posts";
import { GENRE_PAGES } from "@/content/genrePages";
import { buildMetadata, articleJsonLd, JsonLd } from "@/lib/seo";
import { CTA, relatedGenresForPost, CHORD_DETECTOR_URL } from "@/lib/internalLinks";

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

// A paragraph in content/posts.js is either a plain string or an array of
// segments, where a segment is a string or { href, text } for an inline
// link. Kept to that two-shape minimum on purpose: the alternative is
// storing markdown or HTML in the content file, which means either
// shipping a parser or rendering with dangerouslySetInnerHTML, and
// neither is worth it to get a link inside a sentence.
function ParagraphBody({ paragraph }) {
  if (typeof paragraph === "string") return paragraph;

  return paragraph.map((segment, idx) =>
    typeof segment === "string" ? (
      segment
    ) : (
      <Link key={idx} href={segment.href} className="text-text-primary underline decoration-accent/50 underline-offset-[3px] transition-colors hover:text-accent">
        {segment.text}
      </Link>
    )
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return buildMetadata({ title: "Not found", description: "This post doesn't exist.", path: "/blog", noindex: true });

  return buildMetadata({
    title: `${post.title} — Auralith Forge`,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.keywords,
    image: post.image,
  });
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const otherPosts = POSTS.filter((p) => p.slug !== post.slug);
  const relatedGenres = relatedGenresForPost(post.slug);

  return (
    <>
    <main className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-4 sm:px-6">
      <SiteHeader />
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: post.description,
          path: `/blog/${post.slug}`,
          datePublished: post.datePublished,
          image: post.image,
        })}
      />

      <Link href="/blog" className="text-[13px] text-text-secondary transition-colors hover:text-text-primary">
        ← All guides
      </Link>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">
        {post.readingTime} · {post.datePublished}
      </p>
      <h1 className="mt-3 font-[var(--font-title)] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[46px]">{post.title}</h1>

      <div className="relative mt-8 h-80 w-full overflow-hidden rounded-[1.5rem] ring-1 ring-inset ring-black/[0.06]">
        {/* This is the article's LCP element — priority preloads it
            instead of the default lazy behavior, which would otherwise
            delay it behind everything else on the page. */}
        <Image src={post.image} alt={post.title} fill sizes="(max-width: 760px) 100vw, 760px" priority className="object-cover" />
      </div>

      <div className="legal-prose mt-10 max-w-[68ch] space-y-5 text-[17px] leading-[1.7] text-text-secondary">
        {post.paragraphs.map((p, idx) => (
          <p key={idx} className="m-0"><ParagraphBody paragraph={p} /></p>
        ))}
      </div>

      <div className="mt-12 rounded-[1.5rem] bg-black/[0.035] p-7 ring-1 ring-inset ring-black/[0.05]">
        <p className="m-0 text-[17px] font-semibold text-text-primary">Want to hear this applied to your own track?</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Link
            href={CTA.signup}
            className="inline-block rounded-full bg-text-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          >
            Master a track free
          </Link>
          <Link
            href={CTA.pricing}
            className="inline-block rounded-full bg-black/[0.055] px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-primary transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          >
            Studio &amp; All-Access plans →
          </Link>
        </div>
      </div>

      {relatedGenres.length ? (
        <div className="mt-8">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">Related genre guides</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {relatedGenres.map((g) => (
              <Link key={g} href={`/master/${g}`} className="text-sm font-medium text-text-primary transition-colors hover:text-accent">
                {GENRE_PAGES[g].label} mastering →
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">Also useful</p>
        <Link href={CHORD_DETECTOR_URL} className="mt-2 block text-sm font-medium text-text-primary transition-colors hover:text-accent">
          Know the chords before you master — try Chord Detector →
        </Link>
      </div>

      {otherPosts.length ? (
        <div className="mt-14 border-t border-black/[0.08] pt-8">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">More guides</p>
          <div className="mt-3 flex flex-col gap-2">
            {otherPosts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="text-sm font-medium text-text-primary transition-colors hover:text-accent">
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
    <Footer />
    </>
  );
}
