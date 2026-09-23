import Link from "next/link";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, CtaBand, Faq, LinkList, PageHero, PageShell, Section, Steps } from "@/components/site/Page";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { PRODUCT, SUPPORTED_FORMATS_TEXT, paidEntryText } from "@/lib/product";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { COMPARISON_PAGES, COMPARISON_KEYS } from "@/content/comparisonPages";
import { TOOL_LANDING_KEYS, TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { CTA, CHORD_DETECTOR_URL, LOUDNESS_TARGETS_URL } from "@/lib/internalLinks";
import { buildMetadata, JsonLd, faqJsonLd, organizationJsonLd, SITE_NAME } from "@/lib/seo";

// The broad-intent landing page — "AI mastering online" / "master a song
// online" / "best AI mastering software" are searches from someone who
// doesn't know Auralith Forge exists yet, as opposed to the homepage
// (branded searches) or the /master/[genre] and /vs/[competitor] pages
// (narrower, more qualified intent). This is the hub those narrower pages
// all link back up to.
export const metadata = buildMetadata({
  title: `AI Mastering Online — Master Your Music in Minutes | ${SITE_NAME}`,
  description:
    "Master your music online with an adaptive DSP engine that analyzes your mix before changing anything — genre-aware targets, level-matched A/B, codec preview, stem-aware processing. 3 free masters, no card required.",
  path: "/ai-mastering-online",
  keywords: [
    "ai mastering online",
    "master a song online",
    "master a song online free",
    "online mastering studio",
    "best ai mastering software",
    "free ai mastering",
    "online audio mastering",
  ],
});

// English-only, duplicated from lib/i18n.js's "features.f1"-"features.f6"
// deliberately, not imported — same reasoning as root page.js's FAQ_ITEMS:
// this is marketing copy tied to a static SEO page, not runtime UI state,
// and importing the i18n module would pull LanguageProvider's client-only
// machinery into a server component for no benefit (this page is
// English-only by design, like every other /master, /vs, /chord-detector
// SEO page in this app).
const FEATURES = [
  { title: "Adaptive DSP, not a preset button", body: "Automatic analysis-first processing for tonal balance, loudness, and dynamics — measured before anything is touched, not a single one-size-fits-all filter." },
  { title: "Presets as direction, not a fixed chain", body: "Curated mixing presets and editable JSON chains keep a catalog consistent — the engine still reads each track and only applies what it needs." },
  { title: "Instant, gain-matched A/B", body: "Compare original and mastered output instantly, with playback levels matched — so loudness alone never wins the comparison." },
  { title: "Artist Profiles", body: "Save an artist's sound — genre, style, objective and direction — and reuse it. Each new track is still analyzed first, so the character carries over without forcing one track's EQ onto the next." },
  { title: "Codec preview", body: "Hear what actually reaches a listener after MP3, AAC, or Opus compression — a real encode/decode round-trip, not an estimate." },
  { title: "Stem-aware mastering", body: "Optionally separate the vocal from the accompaniment and rebalance them independently before the final master." },
];

const FAQ_ITEMS = [
  {
    question: "Do I need to install anything to master online with Auralith Forge?",
    answer: "No — everything runs in the browser. Upload a track, the DSP engine processes it server-side, and you download the finished master. No plugins, no DAW required.",
  },
  {
    question: "What file formats can I upload?",
    answer: `${SUPPORTED_FORMATS_TEXT} are accepted and decoded automatically, up to ${PRODUCT.maxUploadMb} MB. Final export is WAV or MP3.`,
  },
  {
    question: "Is it actually free, or a time-limited trial?",
    answer: `3 full-length masters are free, no card required — a lifetime allowance, not a trial that expires after a week. After that: ${paidEntryText()}. Studio and All-Access add the Professional engine and more masters.`,
  },
  {
    question: "How is this different from a generic 'AI mastering' button?",
    answer: "It measures your mix before it decides anything. Genre sets the context — what to protect and where the targets sit (see the mastering pages below for what changes per genre) — but every EQ, compression and limiting move is sized from your own audio, so a healthy mix is changed very little.",
  },
];

const HOW = [
  ["01", "Measure", "Spectrum, loudness, true peak, crest factor, transients, stereo image and low-end mono safety are measured before anything is touched."],
  ["02", "Diagnose & plan", "Real problems are detected with a confidence score; only confident ones get a move, sized to a change budget that shrinks for mixes that are already healthy."],
  ["03", "Process & check", "EQ, compression, width and true-peak limiting run once, then the result is re-measured. If a move made things worse, the engine backs it off."],
];

export default function AiMasteringOnlinePage() {
  return (
    <PageShell>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />

      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "AI Mastering", href: "/ai-mastering-online" }]} />

      <PageHero
        eyebrow="AI Mastering Online"
        title="AI Mastering Online That Listens Before It Touches Anything"
        lead="Master your music online with a real DSP engine — not a black box. Upload a track, get a mastered version back in minutes — analysis-first EQ, multiband compression, saturation, stereo imaging, and true-peak limiting, sized to what your mix actually needs rather than applied identically to everything. 3 full masters are free, no card required, so you can hear the actual output before deciding anything."
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

      <Section title="How adaptive mastering works">
        <Steps steps={HOW} />
      </Section>

      <Section title="What you actually get">
        <ul className="m-0 grid list-none gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle p-0 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="bg-bg p-6">
              <h3 className="m-0 text-[17px] font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-text-secondary">{f.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Master by genre" intro="Genre is context, not a preset: it sets what the engine protects and where its targets sit, while your mix drives every decision. See what changes per genre.">
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-4">
          {GENRE_KEYS.map((g) => (
            <li key={g}>
              <Link
                href={`/master/${g}`}
                className="flex h-full items-center justify-between rounded-xl border border-border-subtle bg-white/55 px-4 py-3.5 text-[15px] font-semibold text-text-primary transition hover:border-text-primary/30 hover:bg-white"
              >
                {GENRE_PAGES[g].label}
                <span aria-hidden="true" className="text-text-secondary">→</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[15px]">
          <Link href={LOUDNESS_TARGETS_URL} className="text-link">
            See every genre&apos;s LUFS and dynamic range target in one table
          </Link>
        </p>
      </Section>

      <Section id="pricing" title="Pricing" tone="band">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const featured = key === "studio";
            return (
              <li
                key={key}
                className={`flex flex-col rounded-2xl border p-5 ${featured ? "border-text-primary bg-white" : "border-border-subtle bg-white/55"}`}
              >
                <h3 className="m-0 text-[15px] font-semibold text-text-primary">{plan.label}</h3>
                <p className="m-0 mt-2 font-[var(--font-title)] text-3xl font-semibold tracking-[-0.02em] text-text-primary">
                  {plan.price}
                  {plan.period ? <span className="text-sm font-normal text-text-secondary">{plan.period}</span> : null}
                </p>
                <p className="mt-2 text-[14px] leading-[1.55] text-text-secondary">{plan.blurb}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={CTA.signup} className="btn-primary">
            Try it free
          </Link>
          <Link href={CTA.pricing} className="btn-secondary">
            Full pricing breakdown
          </Link>
        </div>
      </Section>

      <Section title="Questions">
        <Faq items={FAQ_ITEMS} />
      </Section>

      <Section>
        <div className="grid gap-10 sm:grid-cols-2">
          <LinkList
            title="Comparing tools?"
            links={COMPARISON_KEYS.map((key) => ({ href: `/vs/${key}`, label: `Auralith Forge vs ${COMPARISON_PAGES[key].label}` }))}
          />
          <LinkList
            title="Free analysis tools"
            links={[
              { href: CHORD_DETECTOR_URL, label: "Free chord & key detector" },
              ...TOOL_LANDING_KEYS.map((key) => ({ href: `/${key}`, label: TOOL_LANDING_PAGES[key].label })),
            ]}
          />
        </div>
      </Section>

      <RelatedTools current="adaptive-mastering" />

      <CtaBand
        title="Hear your own track mastered"
        body="3 full masters free, no card required. Compare against your mix at matched loudness before you decide anything."
        primary={{ href: CTA.signup, label: "Master a track free" }}
        secondary={{ href: LOUDNESS_TARGETS_URL, label: "Loudness targets by genre" }}
      />
    </PageShell>
  );
}
