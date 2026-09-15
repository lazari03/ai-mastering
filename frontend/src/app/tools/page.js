import Link from "next/link";

import Footer from "@/components/Footer";
import { buildMetadata, JsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Free Music Tools — LUFS Meter, BPM, Key & Chord Detector | ${SITE_NAME}`,
  description:
    "Free, no-signup tools for musicians and producers: measure loudness, find the tempo, detect the key, or get the full chord progression of any track.",
  path: "/tools",
  keywords: ["free music tools", "lufs meter", "bpm finder", "key finder", "chord detector"],
});

function breadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Free Tools", item: absoluteUrl("/tools") },
    ],
  };
}

const TOOLS = [
  {
    href: "/lufs-meter",
    label: "LUFS Meter",
    description: "Measure Integrated Loudness, True Peak, and Loudness Range — the same analysis Studio runs on every upload.",
  },
  {
    href: "/chord-detector",
    label: "Chord Detector",
    description: "Get the key, BPM, and full chord progression of any recording, synced to playback.",
  },
  {
    href: "/bpm-finder",
    label: "BPM Finder",
    description: "Detect a track's exact tempo for beatmatching, syncing samples, or setting a click track.",
  },
  {
    href: "/song-key-finder",
    label: "Key Finder",
    description: "Find the musical key of any track — for transposing, DJ set planning, or matching a cover to your vocal range.",
  },
];

export default function ToolsHubPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
        <JsonLd data={breadcrumbJsonLd()} />

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-zinc-400">
          <Link href="/" className="hover:text-zinc-200">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-300">Free Tools</span>
        </nav>

        <h1 className="mt-4 font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">Free Music Tools</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          Real audio analysis, no account required to try them. Every one of these is free, always — no trial limit,
          no card.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:border-brass/40 hover:bg-brass/[0.04]"
            >
              <p className="m-0 text-base font-semibold text-white">{tool.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{tool.description}</p>
              <span className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-brass">Try it →</span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6 text-center">
          <p className="m-0 text-sm text-zinc-200">Once you've got your reading, hear what your track sounds like mastered.</p>
          <div className="mt-4">
            <Link
              href="/lufs-meter"
              className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
            >
              Start with the LUFS Meter →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
