import Link from "next/link";
import { notFound } from "next/navigation";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, Checklist, CtaBand, Faq, LinkList, PageHero, PageShell, Section } from "@/components/site/Page";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { GENRE_ENGINE_CONTEXT, GENRE_HERO, PRIORITY_LABELS } from "@/content/genreEngineContext";
import { buildMetadata, JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";
import { CTA, relatedPostForGenre, CHORD_DETECTOR_URL, LOUDNESS_TARGETS_URL } from "@/lib/internalLinks";

export function generateStaticParams() {
  return GENRE_KEYS.map((genre) => ({ genre }));
}

export async function generateMetadata({ params }) {
  const { genre } = await params;
  const page = GENRE_PAGES[genre];
  if (!page) return buildMetadata({ title: "Not found", description: "This page doesn't exist.", path: "/", noindex: true });

  return buildMetadata({
    title: `${page.headline} | ${SITE_NAME}`,
    description: page.description,
    path: `/master/${genre}`,
    keywords: page.keywords,
  });
}

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

function breadcrumbJsonLd(genre, page) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "AI Mastering", item: absoluteUrl("/ai-mastering-online") },
      { "@type": "ListItem", position: 3, name: `${page.label} mastering`, item: absoluteUrl(`/master/${genre}`) },
    ],
  };
}

const f1 = (n) => n.toFixed(1);

// Genre-specific answers built from the engine's real numbers for this genre.
function faqFor(page, ctx, hero) {
  const label = page.label.toLowerCase();
  return [
    {
      question: `How loud will my ${label} master be?`,
      answer: `With the default Modern style the engine aims for about ${f1(ctx.preferredLufs)} LUFS integrated and accepts anything from ${f1(ctx.windowMin)} to ${f1(ctx.windowMax)} LUFS. A mix already inside that range at or above ${f1(ctx.preferredLufs)} keeps its level; a quieter one is raised only as far as its transients allow. True peak is held at -1.0 dBTP.`,
    },
    {
      question: `Does choosing ${page.label} apply a fixed ${label} preset?`,
      answer: `No. The genre tells the engine what to protect — for ${label}, ${hero.protects} — and where the loudness and tonal targets sit. Every EQ, compression and limiting decision is then made from measurements of your own mix, so two ${label} tracks get two different masters.`,
    },
    {
      question: "What if my track is between genres?",
      answer: `Pick the genre whose priorities match what matters most in your mix, or use a reference track in the app so the tonal target leans toward it. Genre only sets context; a healthy mix is changed very little whichever you choose.`,
    },
  ];
}

export default async function GenreMasteringPage({ params }) {
  const { genre } = await params;
  const page = GENRE_PAGES[genre];
  if (!page) notFound();

  const ctx = GENRE_ENGINE_CONTEXT[genre];
  const hero = GENRE_HERO[genre];
  const otherGenres = GENRE_KEYS.filter((g) => g !== genre);
  const relatedPost = relatedPostForGenre(genre);
  const label = page.label.toLowerCase();
  const faq = faqFor(page, ctx, hero);

  const numbers = [
    ["Preferred loudness", `${f1(ctx.preferredLufs)} LUFS`, "Default Modern style"],
    ["Acceptable window", `${f1(ctx.windowMin)} to ${f1(ctx.windowMax)} LUFS`, "Inside it, the level is left alone"],
    ["Crest factor floor", `${f1(ctx.crestDb)} dB`, "Loudness stops before dynamics drop below this"],
    ["Max stereo width", ctx.maxWidth.toFixed(2), ctx.maxWidth < 0.5 ? "Near-mono by design" : "Never widened past this"],
    ["True-peak ceiling", "-1.0 dBTP", "Safe through MP3/AAC encoding"],
  ];

  return (
    <PageShell>
      <JsonLd data={serviceJsonLd(genre, page)} />
      <JsonLd data={breadcrumbJsonLd(genre, page)} />
      <JsonLd data={faqJsonLd(faq)} />

      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "AI Mastering", href: "/ai-mastering-online" },
          { name: `${page.label} mastering`, href: `/master/${genre}` },
        ]}
      />

      <PageHero
        eyebrow={`${page.label} mastering`}
        title={hero.h1}
        lead={hero.lead}
        actions={
          <>
            <Link href={CTA.signup} className="btn-primary">
              Master a {label} track free <span aria-hidden="true">→</span>
            </Link>
            <Link href={CTA.pricing} className="btn-secondary">
              Studio &amp; All-Access plans
            </Link>
          </>
        }
        aside={
          <div className="bezel">
            <div className="bezel-core p-5 sm:p-6">
              <p className="m-0 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                {page.label} context
              </p>
              <p className="m-0 mt-4 text-[13px] text-text-secondary">What the engine protects most</p>
              <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                {Object.entries(ctx.priorities).map(([key, value]) => (
                  <li key={key}>
                    <div className="flex items-center justify-between text-[14px] text-text-primary">
                      <span>{PRIORITY_LABELS[key]}</span>
                      <span className="font-mono text-[12px] text-text-secondary">{Math.round(value * 100)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border-subtle pt-4">
                <div>
                  <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">Preferred</p>
                  <p className="m-0 mt-1 font-[var(--font-title)] text-xl font-semibold text-text-primary">{f1(ctx.preferredLufs)} LUFS</p>
                </div>
                <div>
                  <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-text-secondary">Crest floor</p>
                  <p className="m-0 mt-1 font-[var(--font-title)] text-xl font-semibold text-text-primary">{f1(ctx.crestDb)} dB</p>
                </div>
              </div>
            </div>
          </div>
        }
      />

      <Section title={page.headline}>
        <div className="af-prose">
          <p>{page.intro}</p>
        </div>
      </Section>

      <Section title="Genre is context — your mix drives the decisions" tone="band">
        <div className="af-prose">
          <p>
            Choosing {page.label} does not load a {label} preset. It tells the engine what a good {label} master protects —{" "}
            {hero.protects} — and where its tonal balance, dynamics, stereo width and loudness targets sit. Then it measures your upload:
            its spectrum, crest factor, transients, stereo image and integrated loudness.
          </p>
          <p>
            Every move is sized from that measurement. A {label} mix that already sounds right is changed very little; one with a real
            problem — harsh upper mids, a boomy low end, peaks eating the headroom — gets exactly that problem addressed. Two {label} tracks
            get two different masters.
          </p>
        </div>
      </Section>

      <Section title={`What the engine does for ${label}`}>
        <Checklist items={page.bullets} columns={2} />
      </Section>

      <Section title={`The numbers behind ${label} mastering`} intro="The engine's real targets for this genre, with the default Modern style.">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[520px] border-collapse text-[15px]">
            <tbody>
              {numbers.map(([k, v, note]) => (
                <tr key={k} className="border-b border-border-subtle">
                  <th scope="row" className="py-3 pr-4 text-left font-semibold text-text-primary">
                    {k}
                  </th>
                  <td className="whitespace-nowrap py-3 pr-4 text-right font-mono tabular-nums text-text-primary">{v}</td>
                  <td className="py-3 text-text-secondary">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[15px] text-text-secondary">
          {/* Every genre page cites the loudness reference, because that
              page's table has a row for this exact genre. */}
          <Link href={LOUDNESS_TARGETS_URL} className="text-link">
            How loud should a {label} master be? See the LUFS targets by genre
          </Link>
        </p>
      </Section>

      <Section title="Questions">
        <Faq items={faq} />
      </Section>

      <Section>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {relatedPost ? <LinkList title="Related reading" links={[{ href: `/blog/${relatedPost.slug}`, label: relatedPost.title }]} /> : null}
          <LinkList
            title="Also useful"
            links={[
              { href: CHORD_DETECTOR_URL, label: "Know the chords before you master — try Chord Detector" },
              { href: "/lufs-meter", label: "Check your mix's loudness first — LUFS Meter" },
            ]}
          />
          <LinkList title="Other genres" links={otherGenres.map((g) => ({ href: `/master/${g}`, label: `${GENRE_PAGES[g].label} mastering` }))} />
        </div>
      </Section>

      <RelatedTools current="adaptive-mastering" />

      <CtaBand
        title={`Master a ${label} track free`}
        body="3 masters, no card required. Upload your mix and hear what changes — and what the engine chose to leave alone."
        primary={{ href: CTA.signup, label: "Start free" }}
        secondary={{ href: CTA.pricing, label: "Studio & All-Access plans" }}
      />
    </PageShell>
  );
}
