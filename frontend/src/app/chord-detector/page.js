import Link from "next/link";
import Image from "next/image";

import Footer from "@/components/Footer";
import PublicChordDetector from "@/components/audio/PublicChordDetector";
import { CTA, CHORD_DETECTOR_RELATED_GENRES } from "@/lib/internalLinks";
import { GENRE_PAGES } from "@/content/genrePages";
import { TOOL_LANDING_KEYS, TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { buildMetadata, JsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Chord Detector — Find Key, BPM & Chords Online | ${SITE_NAME}`,
  description:
    "Upload a song and get its key, BPM, and full chord progression back — for guitar, piano, or any instrument. Completely free, no limit, no card required.",
  path: "/chord-detector",
  keywords: [
    "chord detector",
    "chord detection online",
    "find chords in a song",
    "guitar chord finder",
    "AI chord recognition",
    "song key finder",
    "BPM detector",
  ],
});

function serviceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Chord Detector",
    serviceType: "Automatic chord and key detection",
    provider: { "@type": "Organization", name: SITE_NAME },
    description:
      "Upload a song and get its key, BPM, and chord progression detected automatically — for guitar, piano, or any instrument.",
    url: absoluteUrl("/chord-detector"),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Free, unlimited chord detection.",
    },
  };
}

function breadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Chord Detector", item: absoluteUrl("/chord-detector") },
    ],
  };
}

const HOW_IT_WORKS = [
  ["01", "Upload your track", "Any format — a rough phone recording works fine, doesn't need to be mastered first."],
  ["02", "We analyze it", "Real audio analysis (madmom + essentia) detects key, tempo, and the chord progression, section by section."],
  ["03", "Play along", "Chords sync to playback in real time — scroll through the progression as the track plays."],
];

export default function ChordDetectorPage() {
  return (
    <>
    <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={serviceJsonLd()} />
      <JsonLd data={breadcrumbJsonLd()} />

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-zinc-400">
        <Link href="/" className="hover:text-zinc-200">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-300">Chord Detector</span>
      </nav>

      <h1 className="mt-4 font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">
        Know every chord in any song, in seconds.
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
        Upload a track and get its key, BPM, and chord progression back — real audio analysis, any instrument.
      </p>

      <div id="chord-tool" className="mt-6 scroll-mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
        <PublicChordDetector />
      </div>

      <div className="relative mt-10 h-[260px] w-full overflow-hidden rounded-[28px] border border-white/10 sm:h-[340px]">
        <Image
          src="https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt="Close-up of a hand forming a chord on an acoustic guitar's fretboard"
          fill
          sizes="(max-width: 900px) 100vw, 900px"
          loading="lazy"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </div>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300">
        Works for guitar, piano, or any instrument: if it's in the recording, the engine hears it. Built for
        guitarists learning a song by ear, cover bands charting a setlist, and producers who just want to know what
        key a reference track is in.
      </p>

      <section className="mt-10">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">How it works</h2>
        <div className="mt-5 flex flex-col gap-4">
          {HOW_IT_WORKS.map(([n, title, body]) => (
            <div key={n} className="flex gap-5 rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="m-0 font-[var(--font-title)] text-2xl font-bold text-brass">{n}</p>
              <div>
                <p className="m-0 text-base font-semibold text-white">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="relative h-56 overflow-hidden rounded-2xl border border-white/10">
          <Image
            src="https://images.pexels.com/photos/1246437/pexels-photo-1246437.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="Hands playing a chord on a piano"
            fill
            sizes="(max-width: 640px) 100vw, 450px"
            loading="lazy"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <p className="absolute inset-x-0 bottom-0 p-4 text-sm font-semibold text-white">Not just guitar</p>
        </div>
        <div className="relative h-56 overflow-hidden rounded-2xl border border-white/10">
          <Image
            src="https://images.pexels.com/photos/210922/pexels-photo-210922.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="A guitarist performing live on stage"
            fill
            sizes="(max-width: 640px) 100vw, 450px"
            loading="lazy"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <p className="absolute inset-x-0 bottom-0 p-4 text-sm font-semibold text-white">Any recording quality</p>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6 text-center">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Completely free</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          No trial limit, no card, no subscription — chord detection is free for every song, always.
        </p>
        <div className="mt-5">
          <Link
            href="#chord-tool"
            className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            Analyze a track — it's free ↑
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Questions</h2>
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">How accurate is it?</p>
            <p className="mt-1.5 text-sm text-zinc-400">
              Estimated from the actual audio, not a database lookup — genuinely good on most recordings, but it's a
              starting point for the key and chords, not a guaranteed-accurate transcription. Complex jazz voicings
              or heavily distorted mixes are harder than a clean pop or acoustic recording.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">Do I need to master the track first?</p>
            <p className="mt-1.5 text-sm text-zinc-400">
              No — chord detection is a separate tool from mastering. Upload a rough recording, a reference track, or
              a finished master; it works on any of them independently.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">Is this bundled with a mastering plan?</p>
            <p className="mt-1.5 text-sm text-zinc-400">
              No — it's a separate, free tool. You don't need to master anything, subscribe, or pay anything to use
              it, whether or not you're on a mastering plan.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Looking for just one thing?</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {TOOL_LANDING_KEYS.map((key) => (
            <Link key={key} href={`/${key}`} className="text-sm text-brass hover:text-ember">
              {TOOL_LANDING_PAGES[key].label} →
            </Link>
          ))}
        </div>

        <p className="m-0 mt-6 text-xs uppercase tracking-[0.12em] text-zinc-500">Once you know the chords, master the track</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {CHORD_DETECTOR_RELATED_GENRES.map((g) => (
            <Link key={g} href={`/master/${g}`} className="text-sm text-brass hover:text-ember">
              {GENRE_PAGES[g].label} mastering →
            </Link>
          ))}
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
