import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { POSTS, getPostBySlug } from "@/content/posts";
import { buildMetadata, articleJsonLd, JsonLd } from "@/lib/seo";

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }) {
  const post = getPostBySlug(params.slug);
  if (!post) return buildMetadata({ title: "Not found", description: "This post doesn't exist.", path: "/blog", noindex: true });

  return buildMetadata({
    title: `${post.title} — Auralith Forge`,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.keywords,
    image: post.image,
  });
}

export default function BlogPostPage({ params }) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  const otherPosts = POSTS.filter((p) => p.slug !== post.slug);

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: post.description,
          path: `/blog/${post.slug}`,
          datePublished: post.datePublished,
          image: post.image,
        })}
      />

      <Link href="/blog" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← All guides
      </Link>

      <p className="mt-5 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
        {post.readingTime} · {post.datePublished}
      </p>
      <h1 className="mt-2 font-[var(--font-title)] text-3xl text-white sm:text-4xl">{post.title}</h1>

      <div className="relative mt-6 h-72 w-full overflow-hidden rounded-2xl border border-white/10">
        {/* This is the article's LCP element — priority preloads it
            instead of the default lazy behavior, which would otherwise
            delay it behind everything else on the page. */}
        <Image src={post.image} alt={post.title} fill sizes="(max-width: 760px) 100vw, 760px" priority className="object-cover" />
      </div>

      <div className="legal-prose mt-8 space-y-5 text-[15px] leading-relaxed text-zinc-300">
        {post.paragraphs.map((p, idx) => (
          <p key={idx} className="m-0">{p}</p>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-brass/30 bg-brass/[0.08] p-5">
        <p className="m-0 text-sm text-zinc-200">Want to hear this applied to your own track?</p>
        <Link
          href="/login"
          className="mt-3 inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
        >
          Master a track free
        </Link>
      </div>

      {otherPosts.length ? (
        <div className="mt-12 border-t border-white/10 pt-8">
          <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">More guides</p>
          <div className="mt-3 flex flex-col gap-2">
            {otherPosts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="text-sm text-brass hover:text-ember">
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
