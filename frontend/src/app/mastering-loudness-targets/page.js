import Link from "next/link";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, Callout, CtaBand, Faq, LinkList, PageHero, PageShell, Section } from "@/components/site/Page";
import { GENRE_PAGES } from "@/content/genrePages";
import {
  LOUDNESS_TARGETS,
  STYLE_DELTAS,
  LIMITER_SPEC,
  LOUDNESS_WINDOW,
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
      "It depends on genre and destination. Roughly: EDM around -7 LUFS integrated, hip-hop -8, pop -9, rock -10.5, lo-fi -12, acoustic -14, podcast -16, classical -18. If streaming is the only destination, the quieter end of your genre's range translates better, because platform loudness normalisation removes any advantage from going louder.",
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

const TOC = [
  ["targets", "LUFS targets by genre"],
  ["why", "Why each genre sits where it does"],
  ["streaming", "What streaming normalisation does"],
  ["style", "Mastering style shifts the target"],
  ["window", "A target is a window, not a cliff"],
  ["limiter", "Limiter settings"],
  ["faq", "Common questions"],
];

const TableWrap = ({ children }) => <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>;
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export default function LoudnessTargetsPage() {
  const rock = LOUDNESS_TARGETS.find((t) => t.genre === "rock").targetLufs;
  const rock90s = STYLE_DELTAS.find((s) => s.style === "rock_90s").deltaLufs;
  return (
    <PageShell>
      <JsonLd data={articleJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />

      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Loudness targets", href: "/mastering-loudness-targets" }]} />

      <PageHero
        eyebrow="Mastering reference"
        title="Mastering Loudness Targets — LUFS by Genre"
        lead="How loud a master should be is a genre question before it is a taste question. The table below is the actual set of targets this site's mastering engine works to — integrated loudness in LUFS, the dynamic range it aims to preserve, and how wide it will let the stereo image go. They double as a reasonable general reference for what each genre is typically mastered to, whatever tool you use."
      />

      <nav aria-label="On this page" className="mt-10 rounded-2xl border border-border-subtle bg-white/55 p-5">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-secondary">On this page</p>
        <ol className="m-0 mt-3 grid list-none gap-x-8 gap-y-2 p-0 sm:grid-cols-2">
          {TOC.map(([id, label], i) => (
            <li key={id} className="text-[15px]">
              <a href={`#${id}`} className="text-text-primary transition hover:text-accent">
                <span className="mr-2 font-mono text-xs text-text-secondary">{String(i + 1).padStart(2, "0")}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* The table is the reason anyone lands here. It goes first, above
          any explanation and well above any CTA. */}
      <Section id="targets" title="LUFS targets by genre">
        <div className="af-prose" style={{ maxWidth: "none" }}>
          <TableWrap>
            <table style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th scope="col">Genre</th>
                  <th scope="col" style={num}>Target LUFS</th>
                  <th scope="col" style={num}>Dynamic range</th>
                  <th scope="col" style={num}>Max width</th>
                </tr>
              </thead>
              <tbody>
                {LOUDNESS_TARGETS.map(({ genre, targetLufs, dynamicRangeDb, maxStereoWidth }) => (
                  <tr key={genre}>
                    <td>
                      <Link href={`/master/${genre}`}>{GENRE_PAGES[genre].label}</Link>
                    </td>
                    <td style={{ ...num, fontWeight: 600 }}>{targetLufs.toFixed(1)}</td>
                    <td style={num}>{dynamicRangeDb.toFixed(1)} dB</td>
                    <td style={num}>{maxStereoWidth.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="text-[14px] text-text-secondary">
            True peak is held at -1.0 dBTP for every genre. Each genre name links to how the rest of the chain shifts for that material.
          </p>
        </div>
      </Section>

      <Section id="why" title="Why each genre sits where it does">
        <ul className="m-0 grid list-none gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle p-0 md:grid-cols-2">
          {LOUDNESS_TARGETS.map(({ genre, targetLufs, note }) => (
            <li key={genre} className="bg-bg p-5 text-[15px] leading-[1.65]">
              <span className="block font-semibold text-text-primary">
                {GENRE_PAGES[genre].label} · {targetLufs.toFixed(1)} LUFS
              </span>
              <span className="mt-1 block text-text-secondary">{note}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="streaming" title="What streaming normalisation does to all of this">
        <div className="af-prose">
          <p>
            Streaming services normalise playback loudness to a reference around {STREAMING_REFERENCE_LUFS} LUFS integrated — the exact
            figure and behaviour vary by platform and by the listener&apos;s own settings. The consequence is the single most misunderstood
            thing about modern mastering: a track mastered to -6 LUFS and one mastered to -12 LUFS play back at the same perceived level.
            The louder master does not win. It simply arrives having already given up dynamic range to get there, and that trade is
            permanent.
          </p>
          <p>
            This is why the targets above are best read as genre character rather than as scores. The club-oriented genres are set louder
            than the streaming reference on purpose — that is what they sound like off-platform, on a DJ system or a download. If streaming
            is your only destination, the quieter end of your genre&apos;s range translates better.
          </p>
          <p>
            True-peak headroom is the part that is not optional. Lossy encoding can push inter-sample peaks above the value a sample-peak
            meter reports, so a master limited to exactly 0 dBFS can distort after transcoding even though the file never technically
            clips. That is what the -1.0 dBTP ceiling protects against.
          </p>
        </div>
      </Section>

      <Section id="style" title="Mastering style shifts the target">
        <div className="af-prose" style={{ maxWidth: "none" }}>
          <p style={{ maxWidth: "68ch" }}>
            Style is selectable independently of genre, and moves the loudness target on top of the genre baseline. A rock track in the{" "}
            <strong>Rock 90s</strong> style targets {rock.toFixed(1)} + {rock90s.toFixed(1)} = {(rock + rock90s).toFixed(1)} LUFS. The default
            style, Modern, steps back 1 LU from every genre baseline.
          </p>
          <TableWrap>
            <table style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th scope="col">Style</th>
                  <th scope="col" style={num}>LUFS delta</th>
                  <th scope="col">Character</th>
                </tr>
              </thead>
              <tbody>
                {STYLE_DELTAS.map(({ style, label, deltaLufs, note }) => (
                  <tr key={style}>
                    <td style={{ whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{fmtLufs(deltaLufs)}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </Section>

      <Section id="window" title="The engine will not chase a target off a cliff">
        <div className="af-prose">
          <p>
            A target is not a promise to hit it. The genre-and-style figure is a preferred point inside an acceptable window — up to{" "}
            {LOUDNESS_WINDOW.aboveLu.toFixed(1)} LU above it and between {LOUDNESS_WINDOW.belowMinLu} and {LOUDNESS_WINDOW.belowMaxLu} LU below
            it, wider below for genres that prize dynamics and for deliberately restrained styles. A mix that already sits inside that window
            at or above the preferred level is left where it is.
          </p>
          <p>
            How far the engine may raise a quieter mix is set by the mix itself: each track gets a limiter budget of {LOUDNESS_WINDOW.limiterBudgetMinDb}{" "}
            to {LOUDNESS_WINDOW.limiterBudgetMaxDb} dB of peak reduction, smaller when the transients are healthy and in a genre that values them,
            and smaller again when the mix arrives already limited. A quiet, dynamic mix will not be slammed to -8 LUFS just because its genre
            target says so, and a mix that arrives already crushed will be left alone rather than pushed further.
          </p>
          <p>
            This is a deliberate design decision rather than a limitation. An automatic engine that always hits its number regardless of the
            source material is one that will happily destroy a well-mixed track to satisfy an arbitrary figure.
          </p>
          <Callout title="In practice">
            Landing a little under your genre&apos;s number on a dynamic mix is the engine protecting the drums, not failing.
          </Callout>
        </div>
      </Section>

      <Section id="limiter" title="Limiter settings">
        <div className="af-prose" style={{ maxWidth: "none" }}>
          <TableWrap>
            <table style={{ minWidth: 520 }}>
              <tbody>
                {LIMITER_SPEC.map(({ label, value, note }) => (
                  <tr key={label}>
                    <th scope="row" style={{ whiteSpace: "nowrap" }}>{label}</th>
                    <td style={{ ...num, fontWeight: 600 }}>{value}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </Section>

      <Section id="faq" title="Common questions">
        <Faq items={FAQ_ITEMS} />
      </Section>

      <Section>
        <div className="grid gap-10 sm:grid-cols-2">
          <LinkList
            title="Mastering by genre"
            links={LOUDNESS_TARGETS.map(({ genre }) => ({ href: `/master/${genre}`, label: `${GENRE_PAGES[genre].label} mastering` }))}
          />
          <LinkList
            title="Also useful"
            links={[
              { href: "/lufs-meter", label: "Measure your own track's LUFS, True Peak and Loudness Range — free LUFS Meter" },
              { href: CHORD_DETECTOR_URL, label: "Know the chords, key and BPM before you master — Chord Detector" },
              { href: "/ai-mastering-online", label: "How online mastering works" },
            ]}
          />
        </div>
      </Section>

      <RelatedTools current="lufs-meter" keys={["lufs-meter", "adaptive-mastering", "reference-mastering", "codec-preview"]} />

      <CtaBand
        title="Hear these targets applied to your own track"
        body="3 masters free, no card required. The engine measures your mix first and moves only as far as the audio allows."
        primary={{ href: CTA.signup, label: "Start free" }}
        secondary={{ href: "/ai-mastering-online", label: "How online mastering works" }}
      />
    </PageShell>
  );
}
