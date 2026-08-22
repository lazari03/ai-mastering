import Link from "next/link";
import Image from "next/image";

import { CHORD_DETECTION } from "@/lib/pricing";
import { CTA } from "@/lib/internalLinks";
import { buildMetadata, JsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Chord Detector — Find Key, BPM & Chords Online | ${SITE_NAME}`,
  description:
    "Upload a song and get its key, BPM, and full chord progression back — for guitar, piano, or any instrument. 3 free detections, then pay per song or go unlimited.",
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
      price: "1.49",
      priceCurrency: "EUR",
      description: "Per-song chord detection after the 3 free lifetime detections are used.",
    },
  };
}

const HOW_IT_WORKS = [
  ["01", "Upload your track", "Any format — a rough phone recording works fine, doesn't need to be mastered first."],
  ["02", "We analyze it", "Real audio analysis (madmom + essentia) detects key, tempo, and the chord progression, section by section."],
  ["03", "Play along", "Chords sync to playback in real time — scroll through the progression as the track plays."],
];

export default function ChordDetectorPage() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={serviceJsonLd()} />

      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <div className="relative mt-6 h-[340px] w-full overflow-hidden rounded-[28px] border border-white/10 sm:h-[420px]">
        <Image
          src="https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=1200"
          alt="Close-up of a hand forming a chord on an acoustic guitar's fretboard"
          fill
          priority
          sizes="(max-width: 900px) 100vw, 900px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-brass">Chord Detector</p>
          <h1 className="mt-2 max-w-lg font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">
            Know every chord in any song, in seconds.
          </h1>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300">
        Upload a track and get its key, BPM, and full chord progression back automatically — real audio analysis, not
        a database lookup or a guess. Works for guitar, piano, or any instrument: if it's in the recording, the
        engine hears it. Built for guitarists learning a song by ear, cover bands charting a setlist, and producers
        who just want to know what key a reference track is in.
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

      <section className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Pricing</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">Free trial</p>
            <p className="m-0 mt-1 text-2xl font-bold text-brass">3 songs</p>
            <p className="mt-2 text-xs text-zinc-400">Lifetime, no card required. Try it before you pay anything.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">Pay per song</p>
            <p className="m-0 mt-1 text-2xl font-bold text-brass">{CHORD_DETECTION.price}</p>
            <p className="mt-2 text-xs text-zinc-400">After your 3 free — no subscription, just this one track.</p>
          </div>
          <div className="rounded-xl border border-brass/40 bg-brass/[0.1] p-4">
            <p className="m-0 text-sm font-semibold text-white">All-Access</p>
            <p className="m-0 mt-1 text-2xl font-bold text-brass">€19.99/mo</p>
            <p className="mt-2 text-xs text-zinc-400">Unlimited chord detection, plus everything else in the studio.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href={CTA.signup}
            className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            Try it free
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
              It's its own standalone product — you don't need to master anything or subscribe to use it. All-Access
              subscribers get it unlimited as part of their plan; everyone else gets 3 free, then pays per song.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
