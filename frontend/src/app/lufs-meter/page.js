import Link from "next/link";

import Footer from "@/components/Footer";
import PublicLufsMeter from "@/components/audio/PublicLufsMeter";
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

function softwareApplicationJsonLd() {
  return {
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
}

function breadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "LUFS Meter", item: absoluteUrl("/lufs-meter") },
    ],
  };
}

const FAQ = [
  {
    question: "What is LUFS?",
    answer:
      "LUFS (Loudness Units Full Scale) measures perceived loudness over time, weighted for how human hearing actually responds across frequencies — unlike dBFS, which just measures raw sample amplitude at an instant.",
  },
  {
    question: "What LUFS should my track be?",
    answer:
      `There's no single correct number — it depends on genre and destination. Streaming platforms normalise playback to around ${Math.abs(STREAMING_REFERENCE_LUFS)} LUFS integrated, so mastering much louder than that doesn't make you louder on playback, it just costs you dynamic range. See our full loudness-targets reference for genre-by-genre numbers.`,
  },
  {
    question: "Why does True Peak matter, not just LUFS?",
    answer:
      "True Peak estimates inter-sample peaks that a normal sample-peak meter misses — if it's above roughly -1 dBTP, lossy encoding (MP3/AAC) on a streaming platform can clip audibly even though your original file looked fine.",
  },
  {
    question: "Is this the same measurement Studio uses?",
    answer:
      "Yes — this calls the same analysis engine Auralith's Studio runs on every upload, not a separate simplified estimate.",
  },
];

export default function LufsMeterPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
        <JsonLd data={softwareApplicationJsonLd()} />
        <JsonLd data={breadcrumbJsonLd()} />
        <JsonLd data={faqJsonLd(FAQ)} />

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-zinc-400">
          <Link href="/" className="hover:text-zinc-200">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-300">LUFS Meter</span>
        </nav>

        <h1 className="mt-4 font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">
          How loud is your track, actually?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          Upload a track and get its Integrated Loudness (LUFS), True Peak, and Loudness Range back — the same
          measurement Studio's mastering engine uses on every upload, explained in plain terms.
        </p>

        <div id="lufs-tool" className="mt-6 scroll-mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <PublicLufsMeter />
        </div>

        <section className="mt-10">
          <h2 className="m-0 font-[var(--font-title)] text-xl text-white">What is LUFS?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            LUFS (Loudness Units Full Scale) is how loud a track actually sounds to a human ear over time, not just
            how high its waveform peaks. Two files can hit the same peak level and still sound very different in
            loudness — LUFS is the number that captures that difference, and it's what every major streaming
            platform uses to decide how much to turn a track up or down on playback.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="m-0 font-[var(--font-title)] text-xl text-white">What counts as loud?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            It depends on genre and where the track is headed — an EDM master and a classical recording aim for very
            different targets on purpose. For genre-by-genre reference numbers (and why mastering louder than
            streaming normalisation stops helping), see the full{" "}
            <Link href="/mastering-loudness-targets" className="text-brass hover:text-ember">
              loudness targets by genre
            </Link>{" "}
            reference.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.1em] text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Genre</th>
                  <th className="px-4 py-2.5 text-right font-medium">Typical Target</th>
                </tr>
              </thead>
              <tbody>
                {LOUDNESS_TARGETS.slice(0, 4).map((row) => (
                  <tr key={row.genre} className="border-b border-white/5 text-zinc-200 last:border-0">
                    <td className="px-4 py-2.5">{labelForGenre(row.genre)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.targetLufs.toFixed(1)} LUFS</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Why True Peak matters</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            A file that looks safe at 0 dBFS can still clip after it's re-encoded to MP3 or AAC for streaming — the
            encoder can create peaks between your original samples ("inter-sample peaks") that a normal meter never
            sees. True Peak estimates those, and keeping roughly -1 dBTP of headroom is what keeps a master safe
            through that re-encoding step.
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6 text-center">
          <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Completely free</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
            No trial limit, no card, no subscription — measure as many tracks as you want.
          </p>
          <div className="mt-5">
            <Link
              href="#lufs-tool"
              className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
            >
              Measure a track — it's free ↑
            </Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Questions</h2>
          <div className="mt-4 flex flex-col gap-3">
            {FAQ.map((item) => (
              <div key={item.question} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="m-0 text-sm font-semibold text-white">{item.question}</p>
                <p className="mt-1.5 text-sm text-zinc-400">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 border-t border-white/10 pt-8">
          <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">More free tools</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            <Link href="/chord-detector" className="text-sm text-brass hover:text-ember">
              Chord Detector →
            </Link>
            <Link href="/bpm-finder" className="text-sm text-brass hover:text-ember">
              BPM Finder →
            </Link>
            <Link href="/song-key-finder" className="text-sm text-brass hover:text-ember">
              Song Key Finder →
            </Link>
            <Link href="/tools" className="text-sm text-brass hover:text-ember">
              All free tools →
            </Link>
          </div>

          <p className="m-0 mt-6 text-xs uppercase tracking-[0.12em] text-zinc-500">Read more</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            <Link href="/mastering-loudness-targets" className="text-sm text-brass hover:text-ember">
              Loudness targets by genre →
            </Link>
            <Link href={CTA.blog} className="text-sm text-brass hover:text-ember">
              Mastering guides →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
