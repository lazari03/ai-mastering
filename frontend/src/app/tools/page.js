import Link from "next/link";

import { Breadcrumbs, CtaBand, PageHero, PageShell, Section } from "@/components/site/Page";
import { STUDIO_GROUPS, SIGNUP_URL } from "@/lib/studio";
import { buildMetadata, JsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Free Music Tools — LUFS Meter, BPM, Key & Chord Detector | ${SITE_NAME}`,
  description:
    "Free, no-signup tools for musicians and producers: measure loudness, find the tempo, detect the key, or get the full chord progression of any track.",
  path: "/tools",
  keywords: ["free music tools", "lufs meter", "bpm finder", "key finder", "chord detector"],
});


// Longer, page-specific descriptions for the free tools (the Studio map's
// one-line blurbs are sized for the nav menu).
const DESCRIPTIONS = {
  "lufs-meter": "Measure Integrated Loudness, True Peak, and Loudness Range — the same analysis Studio runs on every upload.",
  "chord-detector": "Get the key, BPM, and full chord progression of any recording, synced to playback.",
  "bpm-finder": "Detect a track's exact tempo for beatmatching, syncing samples, or setting a click track.",
  "song-key-finder": "Find the musical key of any track — for transposing, DJ set planning, or matching a cover to your vocal range.",
  "chord-progression-finder": "Get the chords of a song in order, timed to the audio — for learning by ear or charting a cover.",
  "adaptive-mastering": "Measures your mix first, then masters only what it needs — genre is context, your audio drives the decisions.",
};

const GROUP_INTRO = {
  analyze: "Free, no account required to try them. Real audio analysis — no trial limit, no card.",
  master: "Mastering runs in the Studio. Try it free, with a plan when you need more.",
  prepare: "Inside the Studio, before mastering.",
  deliver: "Inside the Studio, before release.",
};

const ORDER = ["analyze", "master", "prepare", "deliver"];

function ToolCard({ tool }) {
  return (
    <li>
      <Link
        href={tool.href}
        className="group flex h-full flex-col rounded-2xl border border-border-subtle bg-white/55 p-5 transition duration-300 hover:border-text-primary/30 hover:bg-white"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-[16px] font-semibold text-text-primary">{tool.name.en}</span>
          {tool.appOnly ? (
            <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-text-secondary">In the app</span>
          ) : (
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-text-primary">Free</span>
          )}
        </span>
        <span className="mt-2 text-[14px] leading-[1.6] text-text-secondary">{DESCRIPTIONS[tool.key] || tool.blurb.en}</span>
        <span className="mt-auto pt-4 text-[13px] font-semibold text-text-primary">
          {tool.appOnly ? "Open in the app" : "Open tool"}{" "}
          <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function ToolsHubPage() {
  const groups = ORDER.map((k) => STUDIO_GROUPS.find((g) => g.key === k));
  return (
    <PageShell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free Tools", href: "/tools" }]} />

      <PageHero
        eyebrow="Auralith Studio"
        title="Free Music Tools"
        lead="Real audio analysis, no account required to try them. Every one of these is free, always — no trial limit, no card."
        actions={
          <>
            <Link href="/lufs-meter" className="btn-primary">
              Start with the LUFS Meter <span aria-hidden="true">→</span>
            </Link>
            <Link href="/chord-detector" className="btn-secondary">
              Detect chords, key & BPM
            </Link>
          </>
        }
      />

      {groups.map((group) => (
        <Section key={group.key} id={group.key} eyebrow={group.label.en} title={group.key === "analyze" ? "Analyze a track" : group.key === "master" ? "Master a track" : group.key === "prepare" ? "Prepare a mix" : "Deliver a release"} intro={GROUP_INTRO[group.key]}>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => (
              <ToolCard key={tool.key} tool={tool} />
            ))}
          </ul>
        </Section>
      ))}

      <CtaBand
        title="Once you've got your reading, hear what your track sounds like mastered."
        body="Adaptive mastering measures the same things these tools do — then decides what to change."
        primary={{ href: SIGNUP_URL, label: "Try mastering free" }}
        secondary={{ href: "/ai-mastering-online", label: "How adaptive mastering works" }}
      />
    </PageShell>
  );
}
