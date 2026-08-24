import Link from "next/link";

import Footer from "@/components/Footer";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { COMPARISON_PAGES, COMPARISON_KEYS } from "@/content/comparisonPages";
import { TOOL_LANDING_KEYS, TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { CTA, CHORD_DETECTOR_URL } from "@/lib/internalLinks";
import { buildMetadata, JsonLd, faqJsonLd, organizationJsonLd, SITE_NAME } from "@/lib/seo";
import { IconCheck } from "@/components/app/icons";

// The broad-intent landing page — "AI mastering online" / "master a song
// online" / "best AI mastering software" are searches from someone who
// doesn't know Auralith Forge exists yet, as opposed to the homepage
// (branded searches) or the /master/[genre] and /vs/[competitor] pages
// (narrower, more qualified intent). This is the hub those narrower pages
// all link back up to.
export const metadata = buildMetadata({
  title: `AI Mastering Online — Master Your Music in Minutes | ${SITE_NAME}`,
  description:
    "Master your music online with a real adaptive DSP engine — no software install, no plugins. 21 genre-aware presets, instant A/B, codec preview, stem-aware processing. 3 free masters, no card required.",
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
  { title: "21 genre-aware presets", body: "21 curated mixing presets plus editable JSON chains, so a whole catalog masters consistently instead of every track starting from zero." },
  { title: "Instant, gain-matched A/B", body: "Compare original and mastered output instantly, with playback levels matched — so loudness alone never wins the comparison." },
  { title: "Saved Artist mastering chains", body: "Import a full mastering chain for an artist once, then apply it to every new track from a dropdown — private to your account." },
  { title: "Codec preview", body: "Hear what actually reaches a listener after MP3, AAC, or Opus compression — a real encode/decode round-trip, not an estimate." },
  { title: "Stem-aware mastering", body: "Optionally split vocals, drums, bass, and other elements for independent, more targeted processing before the final mix-down." },
];

const FAQ_ITEMS = [
  {
    question: "Do I need to install anything to master online with Auralith Forge?",
    answer: "No — everything runs in the browser. Upload a track, the DSP engine processes it server-side, and you download the finished master. No plugins, no DAW required.",
  },
  {
    question: "What file formats can I upload?",
    answer: "Common audio formats (WAV, MP3, FLAC, AIFF, and more) are accepted and decoded automatically. Final export is WAV or MP3.",
  },
  {
    question: "Is it actually free, or a time-limited trial?",
    answer: "3 full-length masters are free, no card required — a lifetime allowance, not a trial that expires after a week. After that, Studio is €9.99/mo for 50 masters/month.",
  },
  {
    question: "How is this different from a generic 'AI mastering' button?",
    answer: "The DSP chain is genre-aware (see the mastering pages below for what actually changes per genre), not one universal target applied to every track regardless of style.",
  },
];

export default function AiMasteringOnlinePage() {
  return (
    <>
    <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />

      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <p className="m-0 mt-6 text-[11px] uppercase tracking-[0.18em] text-brass">AI Mastering Online</p>
      <h1 className="mt-2 max-w-2xl font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">
        Master your music online with a real DSP engine — not a black box.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300">
        Upload a track, get a mastered version back in minutes — analysis-first EQ, multiband compression, saturation,
        stereo imaging, and true-peak limiting, tuned per genre rather than applied identically to everything. 3 full
        masters are free, no card required, so you can hear the actual output before deciding anything.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link
          href={CTA.signup}
          className="inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
        >
          Master a track free
        </Link>
        <Link
          href={CTA.pricing}
          className="inline-block rounded-full border border-white/20 bg-black/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-white/35"
        >
          See all plans →
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">What you actually get</h2>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold text-white">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brass/20 text-brass">
                  <IconCheck />
                </span>
                {f.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Master by genre</h2>
        <p className="mt-2 text-sm text-zinc-400">Each genre gets its own DSP target profile — see what actually changes.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {GENRE_KEYS.map((g) => (
            <Link
              key={g}
              href={`/master/${g}`}
              className="rounded-xl border border-white/10 bg-black/20 p-3.5 text-center text-sm font-semibold text-white hover:border-brass/40 hover:text-brass"
            >
              {GENRE_PAGES[g].label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Pricing</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            return (
              <div key={key} className={`rounded-xl border p-4 ${key === "pro" ? "border-brass/40 bg-brass/[0.1]" : "border-white/10 bg-black/20"}`}>
                <p className="m-0 text-sm font-semibold text-white">{plan.label}</p>
                <p className="m-0 mt-1 text-2xl font-bold text-brass">
                  {plan.price}
                  {plan.period ? <span className="text-sm font-normal text-zinc-400">{plan.period}</span> : null}
                </p>
                <p className="mt-2 text-xs text-zinc-400">{plan.blurb}</p>
              </div>
            );
          })}
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
            Full pricing breakdown →
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Questions</h2>
        <div className="mt-4 flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="m-0 text-sm font-semibold text-white">{item.question}</p>
              <p className="mt-1.5 text-sm text-zinc-400">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-white/10 pt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">Comparing tools?</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {COMPARISON_KEYS.map((key) => (
            <Link key={key} href={`/vs/${key}`} className="text-sm text-brass hover:text-ember">
              Auralith Forge vs {COMPARISON_PAGES[key].label} →
            </Link>
          ))}
          <Link href={CHORD_DETECTOR_URL} className="text-sm text-brass hover:text-ember">
            Free chord & key detector →
          </Link>
          {TOOL_LANDING_KEYS.map((key) => (
            <Link key={key} href={`/${key}`} className="text-sm text-brass hover:text-ember">
              {TOOL_LANDING_PAGES[key].label} →
            </Link>
          ))}
        </div>
      </section>
    </main>
    <Footer />
    </>
  );
}
