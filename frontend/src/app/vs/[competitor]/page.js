import Link from "next/link";
import { notFound } from "next/navigation";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, CtaBand, Faq, LinkList, PageHero, PageShell, Section } from "@/components/site/Page";
import { COMPARISON_PAGES, COMPARISON_KEYS } from "@/content/comparisonPages";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { buildMetadata, JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";
import { CTA } from "@/lib/internalLinks";

export function generateStaticParams() {
  return COMPARISON_KEYS.map((competitor) => ({ competitor }));
}

export async function generateMetadata({ params }) {
  const { competitor } = await params;
  const page = COMPARISON_PAGES[competitor];
  if (!page) return buildMetadata({ title: "Not found", description: "This page doesn't exist.", path: "/", noindex: true });

  return buildMetadata({
    title: `${page.headline} | ${SITE_NAME}`,
    description: page.description,
    path: `/vs/${competitor}`,
    keywords: page.keywords,
  });
}

export default async function ComparisonPage({ params }) {
  const { competitor } = await params;
  const page = COMPARISON_PAGES[competitor];
  if (!page) notFound();

  const otherComparisons = COMPARISON_KEYS.filter((k) => k !== competitor);

  return (
    <PageShell>
      <JsonLd data={faqJsonLd(page.faq)} />

      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "AI Mastering", href: "/ai-mastering-online" },
          { name: `vs ${page.label}`, href: `/vs/${competitor}` },
        ]}
      />

      <PageHero
        eyebrow="Comparison"
        title={page.headline}
        lead={page.intro}
        actions={
          <>
            <Link href={CTA.signup} className="btn-primary">
              Master a track free <span aria-hidden="true">→</span>
            </Link>
            <Link href={CTA.pricing} className="btn-secondary">
              See all plans
            </Link>
          </>
        }
      />

      <Section title={`Auralith Forge vs ${page.label}, side by side`}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-text-primary/80">
                <th scope="col" className="w-[22%] py-3 pr-4 font-medium text-text-secondary">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold text-text-primary">
                  Auralith Forge
                </th>
                <th scope="col" className="py-3 font-semibold text-text-secondary">
                  {page.label}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.positioningPoints.map((row) => (
                <tr key={row.title} className="border-b border-border-subtle">
                  <th scope="row" className="py-4 pr-4 align-top font-semibold text-text-primary">
                    {row.title}
                  </th>
                  <td className="py-4 pr-4 align-top leading-[1.6] text-text-primary">{row.auralith}</td>
                  <td className="py-4 align-top leading-[1.6] text-text-secondary">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[13px] text-text-secondary">
          {page.label}&apos;s current pricing and feature set can change — check{" "}
          <a href={page.externalUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-link">
            {page.externalUrl.replace(/^https?:\/\//, "")}
          </a>{" "}
          for their latest plans rather than relying on any snapshot of it here.
        </p>
      </Section>

      <Section title="Hear it on your own track" tone="band">
        <div className="af-prose">
          <p>
            The honest way to compare two mastering tools is to actually listen — not read a feature table. 3 full-length masters are free,
            no card required, so you can run your own A/B before deciding anything.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={CTA.signup} className="btn-primary">
            Master a track free
          </Link>
          <Link href={CTA.pricing} className="btn-secondary">
            See all plans
          </Link>
        </div>
      </Section>

      <Section title="Questions">
        <Faq items={page.faq} />
      </Section>

      <Section>
        <LinkList
          title="More ways to master"
          links={[
            ...otherComparisons.map((key) => ({ href: `/vs/${key}`, label: `Auralith Forge vs ${COMPARISON_PAGES[key].label}` })),
            ...GENRE_KEYS.slice(0, 3).map((g) => ({ href: `/master/${g}`, label: `${GENRE_PAGES[g].label} mastering` })),
            { href: "/ai-mastering-online", label: "AI mastering online" },
          ]}
        />
      </Section>

      <RelatedTools current="adaptive-mastering" />

      <CtaBand
        title="Run your own A/B"
        body="Master the same track in both tools and compare at matched loudness. The free tier covers it."
        primary={{ href: CTA.signup, label: "Master a track free" }}
        secondary={{ href: "/ai-mastering-online", label: "How Auralith masters" }}
      />
    </PageShell>
  );
}
