import PublicChordDetector from "@/components/audio/PublicChordDetector";
import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, CtaBand, Faq, LinkList, PageHero, PageShell, Section, Steps, ToolFrame } from "@/components/site/Page";
import { JsonLd, faqJsonLd } from "@/lib/seo";
import { SUPPORTED_FORMATS_TEXT } from "@/lib/product";

// Formats the upload pipeline accepts — see lib/product.js.
export const SUPPORTED_FORMATS = SUPPORTED_FORMATS_TEXT;

/**
 * Illustrative output shown next to the live tool before anything is
 * uploaded — explicitly labelled as an example, never presented as a
 * measurement.
 */
function ExampleResult({ focus }) {
  const chords = ["Bm", "G", "D", "A", "Bm", "G", "D", "A"];
  const cell = (label, value, big) => (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-white/60 p-4">
      <p className="m-0 text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</p>
      <p className={`m-0 mt-1 font-[var(--font-title)] font-semibold tracking-[-0.02em] text-text-primary ${big ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
  return (
    <figure className="m-0 rounded-[24px] border border-dashed border-border-subtle p-4 sm:p-5">
      <figcaption className="mb-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        Example result
        <span className="rounded-full border border-border-subtle px-2 py-0.5 font-medium normal-case tracking-normal">illustration</span>
      </figcaption>
      <div className="grid grid-cols-2 gap-2">
        {focus === "bpm" ? (
          <>
            {cell("BPM", "124", true)}
            {cell("Key", "B minor")}
          </>
        ) : (
          <>
            {cell("Key", "B minor", focus === "key")}
            {cell("BPM", "124")}
          </>
        )}
      </div>
      <div className="mt-2 rounded-xl border border-border-subtle bg-white/60 p-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.14em] text-text-secondary">Chord progression</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chords.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${i === 2 ? "border-accent bg-accent/10 text-text-primary" : "border-border-subtle text-text-secondary"}`}
            >
              {c}
            </span>
          ))}
        </div>
        <p className="m-0 mt-3 text-[12px] text-text-secondary">The highlighted chord follows playback in the real result.</p>
      </div>
    </figure>
  );
}

/**
 * Shared layout for the audio-analysis tool pages (/chord-detector,
 * /song-key-finder, /bpm-finder, /chord-progression-finder):
 *
 *   search-intent hero (H1 + lead) → the live tool, above the fold
 *   → about → how it works → education → FAQ → next steps → related
 *   tools → CTA.
 *
 * Every piece of copy is server-rendered. The tool is the same real
 * analysis (key, BPM, chords from one upload); `focus` decides which
 * value each page leads with.
 */
export default function AnalyzeToolPage({
  slug,
  toolKey,
  analyticsSlug,
  breadcrumbName,
  eyebrow,
  h1,
  lead,
  focus = "chords",
  toolLabel,
  about,
  steps,
  education = [],
  faq,
  nextLinks = [],
  relatedKeys,
  schemas = [],
  cta,
}) {
  return (
    <PageShell>
      {schemas.map((s, i) => (
        <JsonLd key={i} data={s} />
      ))}
      {faq?.length ? <JsonLd data={faqJsonLd(faq)} /> : null}

      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Tools", href: "/tools" }, { name: breadcrumbName, href: `/${slug}` }]} />

      <PageHero eyebrow={eyebrow} title={h1} lead={lead}>
        <div id="tool" className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start">
          <ToolFrame label={toolLabel} footer={`Free, no card. Supports ${SUPPORTED_FORMATS}.`}>
            {/* PublicChordDetector fires free_tool_opened itself — the old
                ToolLandingAnalytics beacon would double-count this page. */}
            <PublicChordDetector focus={focus} sourceTool={analyticsSlug ? analyticsSlug.replace(/-/g, "_") : "chord_detector"} />
          </ToolFrame>
          <ExampleResult focus={focus} />
        </div>
      </PageHero>

      {about ? (
        <Section title={about.title}>
          <div className="af-prose">
            {about.paragraphs.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
        </Section>
      ) : null}

      {steps?.length ? (
        <Section title="How it works">
          <Steps steps={steps} />
        </Section>
      ) : null}

      {education.map((block) => (
        <Section key={block.title} title={block.title}>
          <div className="af-prose">
            {(block.paragraphs || []).map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
            {block.list ? (
              <ul>
                {block.list.map((item) => (
                  <li key={item.slice(0, 40)}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>
      ))}

      {faq?.length ? (
        <Section title="Questions">
          <Faq items={faq} />
        </Section>
      ) : null}

      {nextLinks.length ? (
        <Section>
          <div className="grid gap-10 sm:grid-cols-2">
            {nextLinks.map((group) => (
              <LinkList key={group.title} title={group.title} links={group.links} />
            ))}
          </div>
        </Section>
      ) : null}

      <RelatedTools current={toolKey} keys={relatedKeys} />

      {cta ? <CtaBand title={cta.title} body={cta.body} primary={{ href: "#tool", label: cta.primary }} secondary={{ href: "/ai-mastering-online", label: "Explore adaptive mastering" }} /> : null}
    </PageShell>
  );
}
