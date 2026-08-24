import Link from "next/link";
import { notFound } from "next/navigation";

import { COMPARISON_PAGES, COMPARISON_KEYS } from "@/content/comparisonPages";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { buildMetadata, JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";
import { CTA } from "@/lib/internalLinks";

export function generateStaticParams() {
  return COMPARISON_KEYS.map((competitor) => ({ competitor }));
}

export function generateMetadata({ params }) {
  const page = COMPARISON_PAGES[params.competitor];
  if (!page) return buildMetadata({ title: "Not found", description: "This page doesn't exist.", path: "/", noindex: true });

  return buildMetadata({
    title: `${page.headline} | ${SITE_NAME}`,
    description: page.description,
    path: `/vs/${params.competitor}`,
    keywords: page.keywords,
  });
}

export default function ComparisonPage({ params }) {
  const page = COMPARISON_PAGES[params.competitor];
  if (!page) notFound();

  const otherComparisons = COMPARISON_KEYS.filter((k) => k !== params.competitor);

  return (
    <main className="mx-auto w-full max-w-[840px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={faqJsonLd(page.faq)} />

      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <p className="m-0 mt-6 text-[11px] uppercase tracking-[0.18em] text-brass">Comparison</p>
      <h1 className="mt-2 font-[var(--font-title)] text-3xl leading-[1.15] text-white sm:text-4xl">{page.headline}</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300">{page.intro}</p>

      <section className="mt-10">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/30">
                <th className="p-4 font-semibold text-zinc-400">&nbsp;</th>
                <th className="p-4 font-semibold text-brass">Auralith Forge</th>
                <th className="p-4 font-semibold text-zinc-400">{page.label}</th>
              </tr>
            </thead>
            <tbody>
              {page.positioningPoints.map((row) => (
                <tr key={row.title} className="border-b border-white/10 last:border-0">
                  <td className="p-4 align-top font-semibold text-white">{row.title}</td>
                  <td className="p-4 align-top text-zinc-200">{row.auralith}</td>
                  <td className="p-4 align-top text-zinc-400">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {page.label}'s current pricing and feature set can change — check{" "}
          <a href={page.externalUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brass hover:text-ember">
            {page.externalUrl.replace(/^https?:\/\//, "")}
          </a>{" "}
          for their latest plans rather than relying on any snapshot of it here.
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Hear it on your own track</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
          The honest way to compare two mastering tools is to actually listen — not read a feature table. 3 full-length
          masters are free, no card required, so you can run your own A/B before deciding anything.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href={CTA.signup}
            className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            Master a track free
          </Link>
          <Link
            href={CTA.pricing}
            className="inline-block rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35"
          >
            See all plans →
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Questions</h2>
        <div className="mt-4 flex flex-col gap-3">
          {page.faq.map((item) => (
            <div key={item.question} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="m-0 text-sm font-semibold text-white">{item.question}</p>
              <p className="mt-1.5 text-sm text-zinc-400">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">More ways to master</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {otherComparisons.map((key) => (
            <Link key={key} href={`/vs/${key}`} className="text-sm text-brass hover:text-ember">
              vs {COMPARISON_PAGES[key].label} →
            </Link>
          ))}
          {GENRE_KEYS.slice(0, 3).map((g) => (
            <Link key={g} href={`/master/${g}`} className="text-sm text-brass hover:text-ember">
              {GENRE_PAGES[g].label} mastering →
            </Link>
          ))}
          <Link href="/ai-mastering-online" className="text-sm text-brass hover:text-ember">
            AI mastering online →
          </Link>
        </div>
      </section>
    </main>
  );
}
