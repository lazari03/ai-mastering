import Link from "next/link";
import { notFound } from "next/navigation";

import Footer from "@/components/Footer";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { buildMetadata, JsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";
import { CTA, relatedPostForGenre, CHORD_DETECTOR_URL, LOUDNESS_TARGETS_URL } from "@/lib/internalLinks";

export function generateStaticParams() {
  return GENRE_KEYS.map((genre) => ({ genre }));
}

export function generateMetadata({ params }) {
  const page = GENRE_PAGES[params.genre];
  if (!page) return buildMetadata({ title: "Not found", description: "This page doesn't exist.", path: "/", noindex: true });

  return buildMetadata({
    title: `${page.headline} | ${SITE_NAME}`,
    description: page.description,
    path: `/master/${params.genre}`,
    keywords: page.keywords,
  });
}

// FAQPage-style JSON-LD reused as a lightweight "what does this do" schema
// tied to the genre — same JsonLd helper as the blog posts' Article schema.
function serviceJsonLd(genre, page) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.headline,
    serviceType: `${page.label} audio mastering`,
    provider: { "@type": "Organization", name: SITE_NAME },
    description: page.description,
    url: absoluteUrl(`/master/${genre}`),
  };
}

export default function GenreMasteringPage({ params }) {
  const page = GENRE_PAGES[params.genre];
  if (!page) notFound();

  const otherGenres = GENRE_KEYS.filter((g) => g !== params.genre);
  const relatedPost = relatedPostForGenre(params.genre);

  return (
    <>
    <main className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={serviceJsonLd(params.genre, page)} />

      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <p className="mt-5 text-[11px] uppercase tracking-[0.12em] text-zinc-500">{page.label} mastering</p>
      <h1 className="mt-2 font-[var(--font-title)] text-3xl text-white sm:text-4xl">{page.headline}</h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-300">{page.intro}</p>

      <ul className="mt-6 flex flex-col gap-2.5">
        {page.bullets.map((b) => (
          <li key={b} className="flex gap-2.5 rounded-xl border border-white/10 bg-black/20 p-3.5 text-sm leading-relaxed text-zinc-300">
            <span className="text-brass">▸</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-2xl border border-brass/30 bg-brass/[0.08] p-5">
        <p className="m-0 text-sm text-zinc-200">Master a {page.label.toLowerCase()} track free — 3 masters, no card required.</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Link
            href={CTA.signup}
            className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            Start free
          </Link>
          <Link
            href={CTA.pricing}
            className="inline-block rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35"
          >
            Studio &amp; All-Access plans →
          </Link>
        </div>
      </div>

      {relatedPost ? (
        <div className="mt-8">
          <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Related reading</p>
          <Link href={`/blog/${relatedPost.slug}`} className="mt-2 block text-sm text-brass hover:text-ember">
            {relatedPost.title} →
          </Link>
        </div>
      ) : null}

      {/* Every genre page cites the loudness reference, because that
          page's table has a row for this exact genre — the most specific
          reciprocal link available, not a generic "see also". */}
      <div className="mt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Reference</p>
        <Link href={LOUDNESS_TARGETS_URL} className="mt-2 block text-sm text-brass hover:text-ember">
          How loud should a {page.label.toLowerCase()} master be? See the LUFS targets by genre →
        </Link>
      </div>

      <div className="mt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Also useful</p>
        <Link href={CHORD_DETECTOR_URL} className="mt-2 block text-sm text-brass hover:text-ember">
          Know the chords before you master — try Chord Detector →
        </Link>
      </div>

      <div className="mt-8 border-t border-white/10 pt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Other genres</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {otherGenres.map((g) => (
            <Link key={g} href={`/master/${g}`} className="text-sm text-brass hover:text-ember">
              {GENRE_PAGES[g].label} mastering
            </Link>
          ))}
        </div>
      </div>
    </main>
    <Footer />
    </>
  );
}
