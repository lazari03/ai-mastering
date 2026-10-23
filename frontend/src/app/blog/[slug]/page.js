import { Fragment } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, Callout, CtaBand, LinkList, PageShell } from "@/components/site/Page";
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
      <Link key={idx} href={segment.href}>
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
  const sections = post.sections || [];
  const sectionAt = Object.fromEntries(sections.map((s) => [s.at, s]));

  return (
    <PageShell width="reading">
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: post.description,
          path: `/blog/${post.slug}`,
          datePublished: post.datePublished,
          image: post.image,
        })}
      />

      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/blog" }, { name: post.title, href: `/blog/${post.slug}` }]} />

      <article>
        <header className="pt-4">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">
            {post.readingTime} · <time dateTime={post.datePublished}>{post.datePublished}</time>
          </p>
          <h1
            className="mt-4 font-[var(--font-title)] text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[48px]"
            style={{ textWrap: "balance" }}
          >
            {post.title}
          </h1>
          <p className="mt-5 text-[18px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
            {post.description}
          </p>
        </header>

        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-[1.5rem] ring-1 ring-inset ring-black/[0.06]">
          {/* This is the article's LCP element — priority preloads it
              instead of the default lazy behavior, which would otherwise
              delay it behind everything else on the page. */}
          <Image src={post.image} alt={post.title} fill sizes="(max-width: 760px) 100vw, 760px" priority className="object-cover" />
        </div>

        {sections.length ? (
          <nav aria-label="In this guide" className="mt-10 border-l-2 border-accent/60 pl-5">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-secondary">In this guide</p>
            <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[15px] text-text-primary transition hover:text-accent">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="af-prose mt-10">
          {post.paragraphs.map((p, idx) => (
            <Fragment key={idx}>
              {sectionAt[idx] ? <h2 id={sectionAt[idx].id}>{sectionAt[idx].title}</h2> : null}
              <p>
                <ParagraphBody paragraph={p} />
              </p>
            </Fragment>
          ))}
          {post.takeaway ? <Callout title="Key takeaway">{post.takeaway}</Callout> : null}
        </div>
      </article>

      <section className="mt-16 grid gap-10 border-t border-border-subtle pt-10 sm:grid-cols-2" aria-label="Related">
        {relatedGenres.length ? (
          <LinkList title="Related genre guides" links={relatedGenres.map((g) => ({ href: `/master/${g}`, label: `${GENRE_PAGES[g].label} mastering` }))} />
        ) : null}
        <LinkList
          title="Also useful"
          links={[
            { href: CHORD_DETECTOR_URL, label: "Know the chords before you master — try Chord Detector" },
            { href: "/mastering-loudness-targets", label: "Mastering loudness targets by genre" },
          ]}
        />
      </section>

      {otherPosts.length ? (
        <section className="mt-16" aria-labelledby="more-guides">
          <h2 id="more-guides" className="m-0 font-[var(--font-title)] text-[24px] font-semibold tracking-[-0.02em] text-text-primary sm:text-[28px]">
            More guides
          </h2>
          <ul className="m-0 mt-6 grid list-none gap-3 p-0">
            {otherPosts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group block rounded-2xl border border-border-subtle bg-white/55 p-5 transition hover:border-text-primary/30 hover:bg-white"
                >
                  <span className="block text-[16px] font-semibold text-text-primary">{p.title}</span>
                  <span className="mt-1.5 block text-[14px] leading-[1.55] text-text-secondary">{p.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RelatedTools keys={["adaptive-mastering", "lufs-meter", "chord-detector", "reference-mastering"]} />

      <CtaBand
        title="Want to hear this applied to your own track?"
        body="3 full masters free, no card required."
        primary={{ href: CTA.signup, label: "Master a track free" }}
        secondary={{ href: CTA.pricing, label: "Studio & All-Access plans" }}
      />
    </PageShell>
  );
}
