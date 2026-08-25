import Link from "next/link";

import Footer from "@/components/Footer";
import { GENRE_PAGES } from "@/content/genrePages";
import {
  LOUDNESS_TARGETS,
  STYLE_DELTAS,
  LIMITER_SPEC,
  RAISE_CAPS,
  STREAMING_REFERENCE_LUFS,
} from "@/content/loudnessTargets";
import { CTA, CHORD_DETECTOR_URL } from "@/lib/internalLinks";
import { buildMetadata, JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

// A reference page, not a landing page. "How loud should I master", "LUFS
// by genre", "what LUFS for Spotify" are high-intent informational
// searches this app can answer with its own real numbers instead of
// opinion — and an informational page that answers the question outright
// is what gets cited by AI answer engines and linked to by other people,
// which a pricing-and-CTA page never is.
//
// Deliberately front-loads the table above any pitch: the answer is the
// product here. The CTA sits below the content, not above it.
export const metadata = buildMetadata({
  title: "Mastering Loudness Targets — LUFS by Genre (Reference Table)",
  description:
    "How loud to master, by genre: integrated LUFS targets, dynamic range and true-peak ceilings for pop, hip-hop, rock, EDM, acoustic, lo-fi, podcast and classical — with what streaming loudness normalisation does to a master that ignores them.",
  path: "/mastering-loudness-targets",
  keywords: [
    "mastering loudness targets",
    "LUFS by genre",
    "how loud should I master",
    "what LUFS for spotify",
    "integrated LUFS mastering",
    "true peak dBTP mastering",
    "loudness normalization streaming",
    "mastering loudness reference",
  ],
});

const FAQ_ITEMS = [
  {
    question: "How loud should I master my track?",
    answer:
      "It depends on genre and destination. Roughly: EDM around -7 LUFS integrated, hip-hop -8, pop -9, rock -9.5, lo-fi -12, acoustic -14, podcast -16, classical -18. If streaming is the only destination, the quieter end of your genre's range translates better, because platform loudness normalisation removes any advantage from going louder.",
  },
  {
    question: "What LUFS should I master to for Spotify and other streaming services?",
    answer:
      "Streaming platforms normalise playback to around -14 LUFS integrated, with the exact figure and behaviour varying by service and by the listener's own settings. Mastering significantly louder than that does not make you louder on playback — it gets turned down, and you keep the lost dynamic range. Leaving true-peak headroom around -1.0 dBTP matters more than the integrated figure.",
  },
  {
    question: "What is LUFS and how is it different from dB?",
    answer:
      "LUFS (Loudness Units Full Scale) measures perceived loudness over time, weighted for how human hearing responds across frequencies. dBFS measures raw sample amplitude at an instant. Two tracks can peak at the same dBFS and still differ by 6 LUFS in how loud they actually sound, which is why loudness normalisation uses LUFS and not peak level.",
  },
  {
    question: "What is true peak, and why is -1 dBTP the standard ceiling?",
    answer:
      "True peak accounts for inter-sample peaks — signal levels that appear between samples once audio is reconstructed to analogue or transcoded to a lossy codec. A master limited to exactly 0 dBFS can therefore clip after an MP3, AAC or Opus encode, even though the file itself never exceeds full scale. A ceiling around -1.0 dBTP leaves room for that.",
  },
  {
    question: "Is a louder master a better master?",
    answer:
      "No, and on streaming it is actively counterproductive. Loudness normalisation means a track mastered to -6 LUFS and one mastered to -12 LUFS play back at the same level, but the -6 version got there by giving up dynamic range permanently. Loudness is a genre-appropriate target, not a score to maximise.",
  },
  {
    question: "How much headroom should I leave in a mix before mastering?",
    answer:
      "Around -6 dBFS peak, with no limiter or loudness maximiser on the master bus. Mastering needs dynamic range to work with — a mix already crushed to -8 LUFS leaves an engine, human or automatic, almost nothing to do.",
  },
];

function articleJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Mastering Loudness Targets — LUFS by Genre",
    description:
      "Integrated LUFS targets, dynamic range and true-peak ceilings by genre, and what streaming loudness normalisation does to a master that ignores them.",
    url: absoluteUrl("/mastering-loudness-targets"),
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: absoluteUrl("/mastering-loudness-targets"),
  };
}

const fmtLufs = (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

export default function LoudnessTargetsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-8 sm:px-6">
        <JsonLd data={articleJsonLd()} />
        <JsonLd data={faqJsonLd(FAQ_ITEMS)} />

        <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
          ← Back to home
        </Link>

        <p className="mt-5 text-[11px] uppercase tracking-[0.12em] text-zinc-500">Mastering reference</p>
        <h1 className="mt-2 font-[var(--font-title)] text-3xl text-white sm:text-4xl">
          Mastering Loudness Targets — LUFS by Genre
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-300">
          How loud a master should be is a genre question before it is a taste question. The table below is the actual set of
          targets this site&apos;s mastering engine works to — integrated loudness in LUFS, the dynamic range it aims to
          preserve, and how wide it will let the stereo image go. They double as a reasonable general reference for what each
          genre is typically mastered to, whatever tool you use.
        </p>

        {/* The table is the reason anyone lands here. It goes first, above
            any explanation and well above any CTA. */}
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <th className="pb-2 text-left font-medium">Genre</th>
                <th className="pb-2 text-right font-medium">Target LUFS</th>
                <th className="pb-2 text-right font-medium">Dynamic range</th>
                <th className="pb-2 text-right font-medium">Max width</th>
              </tr>
            </thead>
            <tbody>
              {LOUDNESS_TARGETS.map(({ genre, targetLufs, dynamicRangeDb, maxStereoWidth }) => (
                <tr key={genre} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/master/${genre}`} className="text-brass hover:text-ember">
                      {GENRE_PAGES[genre].label}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-100">{targetLufs.toFixed(1)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-400">{dynamicRangeDb.toFixed(1)} dB</td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-400">{maxStereoWidth.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          True peak is held at -1.0 dBTP for every genre. Each genre name links to how the rest of the chain shifts for that
          material.
        </p>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">Why each genre sits where it does</h2>
        <ul className="mt-5 flex flex-col gap-2.5">
          {LOUDNESS_TARGETS.map(({ genre, targetLufs, note }) => (
            <li
              key={genre}
              className="rounded-xl border border-white/10 bg-black/20 p-3.5 text-sm leading-relaxed text-zinc-300"
            >
              <span className="font-semibold text-zinc-100">
                {GENRE_PAGES[genre].label} · {targetLufs.toFixed(1)} LUFS
              </span>
              <span className="text-zinc-400"> — {note}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">What streaming normalisation does to all of this</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          Streaming services normalise playback loudness to a reference around {STREAMING_REFERENCE_LUFS} LUFS integrated —
          the exact figure and behaviour vary by platform and by the listener&apos;s own settings. The consequence is the
          single most misunderstood thing about modern mastering: a track mastered to -6 LUFS and one mastered to -12 LUFS
          play back at the same perceived level. The louder master does not win. It simply arrives having already given up
          dynamic range to get there, and that trade is permanent.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          This is why the targets above are best read as genre character rather than as scores. The club-oriented genres are
          set louder than the streaming reference on purpose — that is what they sound like off-platform, on a DJ system or a
          download. If streaming is your only destination, the quieter end of your genre&apos;s range translates better.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          True-peak headroom is the part that is not optional. Lossy encoding can push inter-sample peaks above the value a
          sample-peak meter reports, so a master limited to exactly 0 dBFS can distort after transcoding even though the file
          never technically clips. That is what the -1.0 dBTP ceiling protects against.
        </p>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">Mastering style shifts the target</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          Style is selectable independently of genre, and moves the loudness target on top of the genre baseline. A rock track
          in the <span className="text-zinc-100">Rock 90s</span> style targets -9.5 + -2.0 = -11.5 LUFS.
        </p>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-4">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <th className="pb-2 text-left font-medium">Style</th>
                <th className="pb-2 pr-3 text-right font-medium">LUFS delta</th>
                <th className="pb-2 text-left font-medium">Character</th>
              </tr>
            </thead>
            <tbody>
              {STYLE_DELTAS.map(({ style, label, deltaLufs, note }) => (
                <tr key={style} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3 text-zinc-100">{label}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-brass">{fmtLufs(deltaLufs)}</td>
                  <td className="py-2.5 text-zinc-400">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">The engine will not chase a target off a cliff</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          A target is not a promise to hit it. The chain caps how far it will move loudness in a single pass — between{" "}
          {RAISE_CAPS.minDb} and {RAISE_CAPS.maxDb} dB of raise depending on style. {RAISE_CAPS.clampNote} A quiet, dynamic
          mix will not be slammed to -8 LUFS just because its genre target says so, and a mix that arrives already crushed
          will be left alone rather than pushed further.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
          This is a deliberate design decision rather than a limitation. An automatic engine that always hits its number
          regardless of the source material is one that will happily destroy a well-mixed track to satisfy an arbitrary
          figure.
        </p>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">Limiter settings</h2>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-4">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {LIMITER_SPEC.map(({ label, value, note }) => (
                <tr key={label} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3 text-zinc-100">{label}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-brass">{value}</td>
                  <td className="py-2.5 text-zinc-400">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 font-[var(--font-title)] text-2xl text-white">Common questions</h2>
        <div className="mt-5 flex flex-col gap-4">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <div key={question} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="m-0 text-sm font-semibold text-zinc-100">{question}</p>
              <p className="m-0 mt-2 text-sm leading-relaxed text-zinc-400">{answer}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-brass/30 bg-brass/[0.08] p-5">
          <p className="m-0 text-sm text-zinc-200">
            Hear these targets applied to your own track — 3 masters free, no card required.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Link
              href={CTA.signup}
              className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
            >
              Start free
            </Link>
            <Link
              href="/ai-mastering-online"
              className="inline-block rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35"
            >
              How online mastering works →
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Also useful</p>
          <Link href={CHORD_DETECTOR_URL} className="mt-2 block text-sm text-brass hover:text-ember">
            Know the chords, key and BPM before you master — try Chord Detector →
          </Link>
        </div>

        <div className="mt-8 border-t border-white/10 pt-8">
          <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Mastering by genre</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {LOUDNESS_TARGETS.map(({ genre }) => (
              <Link key={genre} href={`/master/${genre}`} className="text-sm text-brass hover:text-ember">
                {GENRE_PAGES[genre].label} mastering
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
