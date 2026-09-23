import Link from "next/link";

import PublicLufsMeter from "@/components/audio/PublicLufsMeter";
import RelatedTools from "@/components/site/RelatedTools";
import { SUPPORTED_FORMATS } from "@/components/site/AnalyzeToolPage";
import { Breadcrumbs, Callout, CtaBand, Faq, LinkList, PageHero, PageShell, Section, ToolFrame } from "@/components/site/Page";
import { CTA } from "@/lib/internalLinks";
import { LOUDNESS_TARGETS, STREAMING_REFERENCE_LUFS, labelForGenre } from "@/content/loudnessTargets";
import { buildMetadata, JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Free LUFS Meter — Check Integrated Loudness, True Peak & LRA | ${SITE_NAME}`,
  description:
    "Upload a track and measure its Integrated Loudness (LUFS), True Peak, and Loudness Range — the same analysis engine Studio uses on every upload. Free, no card required.",
  path: "/lufs-meter",
  keywords: [
    "lufs meter",
    "check lufs",
    "audio loudness meter",
    "true peak meter",
    "loudness range",
    "lufs for spotify",
    "measure lufs online",
  ],
});

const SOFTWARE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LUFS Meter",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any (runs in browser)",
  description: "Measures Integrated Loudness (LUFS), True Peak, and Loudness Range from an uploaded audio file.",
  url: absoluteUrl("/lufs-meter"),
  provider: { "@type": "Organization", name: SITE_NAME },
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
    { "@type": "ListItem", position: 2, name: "Tools", item: absoluteUrl("/tools") },
    { "@type": "ListItem", position: 3, name: "LUFS Meter", item: absoluteUrl("/lufs-meter") },
  ],
};

const FAQ = [
  {
    question: "What is LUFS?",
    answer:
      "LUFS (Loudness Units Full Scale) measures perceived loudness over time, weighted for how human hearing actually responds across frequencies — unlike dBFS, which just measures raw sample amplitude at an instant.",
  },
  {
    question: "What LUFS should my track be?",
    answer: `There's no single correct number — it depends on genre and destination. Streaming platforms normalise playback to around ${Math.abs(STREAMING_REFERENCE_LUFS)} LUFS integrated, so mastering much louder than that doesn't make you louder on playback, it just costs you dynamic range. See our full loudness-targets reference for genre-by-genre numbers.`,
  },
  {
    question: "Why does True Peak matter, not just LUFS?",
    answer:
      "True Peak estimates inter-sample peaks that a normal sample-peak meter misses — if it's above roughly -1 dBTP, lossy encoding (MP3/AAC) on a streaming platform can clip audibly even though your original file looked fine.",
  },
  {
    question: "Is this the same measurement Studio uses?",
    answer: "Yes — this calls the same analysis engine Auralith's Studio runs on every upload, not a separate simplified estimate.",
  },
];

function ExampleReading() {
  const rows = [
    ["Integrated", "−9.8 LUFS", "Loud — above streaming normalisation"],
    ["True Peak", "−1.2 dBTP", "Safe for MP3/AAC encoding"],
    ["Loudness Range", "5.4 LU", "Moderate dynamics"],
  ];
  return (
    <figure className="m-0 rounded-[24px] border border-dashed border-border-subtle p-4 sm:p-5">
      <figcaption className="mb-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        Example reading
        <span className="rounded-full border border-border-subtle px-2 py-0.5 font-medium normal-case tracking-normal">illustration</span>
      </figcaption>
      <div className="flex flex-col gap-2">
        {rows.map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-border-subtle bg-white/60 p-4">
            <p className="m-0 text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</p>
            <p className="m-0 mt-1 font-[var(--font-title)] text-2xl font-semibold tracking-[-0.02em] text-text-primary">{value}</p>
            <p className="m-0 mt-1 text-[12px] text-text-secondary">{note}</p>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function LufsMeterPage() {
  return (
    <PageShell>
      <JsonLd data={SOFTWARE_JSONLD} />
      <JsonLd data={BREADCRUMB_JSONLD} />
      <JsonLd data={faqJsonLd(FAQ)} />

      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Tools", href: "/tools" }, { name: "LUFS Meter", href: "/lufs-meter" }]} />

      <PageHero
        eyebrow="LUFS Meter · Free"
        title="Free Online LUFS Meter"
        lead="How loud is your track, actually? Upload it and get its Integrated Loudness (LUFS), True Peak, and Loudness Range back — the same measurement Studio's mastering engine uses on every upload, explained in plain terms."
      >
        <div id="lufs-tool" className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start">
          <ToolFrame label="LUFS Meter" footer={`Free, no card. Supports ${SUPPORTED_FORMATS}.`}>
            <PublicLufsMeter />
          </ToolFrame>
          <ExampleReading />
        </div>
      </PageHero>

      <Section title="What is LUFS?">
        <div className="af-prose">
          <p>
            LUFS (Loudness Units Full Scale) is how loud a track actually sounds to a human ear over time, not just how high its
            waveform peaks. Two files can hit the same peak level and still sound very different in loudness — LUFS is the number that
            captures that difference, and it's what every major streaming platform uses to decide how much to turn a track up or down on
            playback.
          </p>
          <p>
            Completely free — no trial limit, no card, no subscription. Measure as many tracks as you want.
          </p>
        </div>
      </Section>

      <Section title="What counts as loud?">
        <div className="af-prose">
          <p>
            It depends on genre and where the track is headed — an EDM master and a classical recording aim for very different targets on
            purpose. For genre-by-genre reference numbers (and why mastering louder than streaming normalisation stops helping), see the
            full <Link href="/mastering-loudness-targets">loudness targets by genre</Link> reference.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Genre</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Typical Target
                </th>
              </tr>
            </thead>
            <tbody>
              {LOUDNESS_TARGETS.slice(0, 4).map((row) => (
                <tr key={row.genre}>
                  <td>{labelForGenre(row.genre)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono, ui-monospace)" }}>{row.targetLufs.toFixed(1)} LUFS</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Why True Peak matters">
        <div className="af-prose">
          <p>
            A file that looks safe at 0 dBFS can still clip after it's re-encoded to MP3 or AAC for streaming — the encoder can create
            peaks between your original samples ("inter-sample peaks") that a normal meter never sees. True Peak estimates those, and
            keeping roughly -1 dBTP of headroom is what keeps a master safe through that re-encoding step.
          </p>
          <Callout title="Reading the three numbers together">
            Integrated loudness tells you where the track sits against streaming normalisation, True Peak tells you whether it survives
            encoding, and Loudness Range tells you how much the level moves between quiet and loud sections. A loud master with a very
            narrow range is usually the sign of heavy limiting.
          </Callout>
        </div>
      </Section>

      <Section title="Questions">
        <Faq items={FAQ} />
      </Section>

      <Section>
        <LinkList
          title="Read more"
          links={[
            { href: "/mastering-loudness-targets", label: "Loudness targets by genre" },
            { href: CTA.blog, label: "Mastering guides" },
            { href: "/tools", label: "All free tools" },
          ]}
        />
      </Section>

      <RelatedTools current="lufs-meter" keys={["chord-detector", "bpm-finder", "song-key-finder", "adaptive-mastering"]} />

      <CtaBand
        title="Measure it, then master it"
        body="Found your track too quiet, too loud or peaking over? Adaptive mastering reads the same measurements and corrects only what the audio needs."
        primary={{ href: "#lufs-tool", label: "Measure a track — it's free" }}
        secondary={{ href: "/ai-mastering-online", label: "Explore adaptive mastering" }}
      />
    </PageShell>
  );
}
