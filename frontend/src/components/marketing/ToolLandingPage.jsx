import Link from "next/link";
import Image from "next/image";

import Footer from "@/components/Footer";
import { CHORD_DETECTION, CHORDS_MONTHLY, PLANS } from "@/lib/pricing";
import { CTA, CHORD_DETECTOR_RELATED_GENRES, CHORD_DETECTOR_URL } from "@/lib/internalLinks";
import { GENRE_PAGES } from "@/content/genrePages";
import { TOOL_LANDING_KEYS, TOOL_LANDING_PAGES } from "@/content/toolLandingPages";
import { JsonLd, faqJsonLd, absoluteUrl, SITE_NAME } from "@/lib/seo";

// Shared layout for /song-key-finder, /bpm-finder, /chord-progression-finder
// — same visual structure as /chord-detector/page.js (that page's own
// layout, not duplicated three times), each page.js just supplies its own
// content object from content/toolLandingPages.js. Chord Detector itself
// stays a separate, standalone page (the umbrella version) rather than
// becoming a fourth entry here — it's the one of the four that already has
// real ranking history, not worth risking by folding it into this template.
export default function ToolLandingPage({ slug, page }) {
  const otherTools = TOOL_LANDING_KEYS.filter((k) => k !== slug);

  function serviceJsonLd() {
    return {
      "@context": "https://schema.org",
      "@type": "Service",
      name: page.label,
      serviceType: "Automatic audio analysis",
      provider: { "@type": "Organization", name: SITE_NAME },
      description: page.description,
      url: absoluteUrl(`/${slug}`),
      offers: {
        "@type": "Offer",
        price: "1.49",
        priceCurrency: "EUR",
        description: "Per-song detection after the 3 free lifetime uses.",
      },
    };
  }

  return (
    <>
    <main className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8 sm:px-6">
      <JsonLd data={serviceJsonLd()} />
      <JsonLd data={faqJsonLd(page.faq)} />

      <Link href="/" className="text-[13px] text-zinc-400 hover:text-zinc-200">
        ← Back to home
      </Link>

      <div className="relative mt-6 h-[340px] w-full overflow-hidden rounded-[28px] border border-white/10 sm:h-[420px]">
        <Image src={page.heroImage} alt={page.heroAlt} fill priority sizes="(max-width: 900px) 100vw, 900px" className="object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-brass">{page.heroCaption}</p>
          <h1 className="mt-2 max-w-lg font-[var(--font-title)] text-3xl leading-[1.1] text-white sm:text-4xl">{page.heroTitle}</h1>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300">{page.intro}</p>

      <section className="mt-10">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">How it works</h2>
        <div className="mt-5 flex flex-col gap-4">
          {page.howItWorks.map(([n, title, body]) => (
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

      <section className="mt-10 rounded-2xl border border-brass/25 bg-brass/[0.06] p-6">
        <h2 className="m-0 font-[var(--font-title)] text-xl text-white">Pricing</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="m-0 text-sm font-semibold text-white">Chords Monthly</p>
            <p className="m-0 mt-1 text-2xl font-bold text-brass">
              {CHORDS_MONTHLY.price}
              <span className="text-sm font-normal text-zinc-400">{CHORDS_MONTHLY.period}</span>
            </p>
            <p className="mt-2 text-xs text-zinc-400">Unlimited detection on its own — no mastering plan needed.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 text-sm font-semibold text-white">{PLANS.pro.label}</p>
            <p className="m-0 mt-1 text-2xl font-bold text-brass">
              {PLANS.pro.price}
              <span className="text-sm font-normal text-zinc-400">{PLANS.pro.period}</span>
            </p>
            <p className="mt-2 text-xs text-zinc-400">Unlimited detection, plus everything else in the studio.</p>
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
          {page.faq.map((item) => (
            <div key={item.question} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="m-0 text-sm font-semibold text-white">{item.question}</p>
              <p className="mt-1.5 text-sm text-zinc-400">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <p className="m-0 text-xs uppercase tracking-[0.12em] text-zinc-500">{page.crossLinkLabel}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {CHORD_DETECTOR_RELATED_GENRES.map((g) => (
            <Link key={g} href={`/master/${g}`} className="text-sm text-brass hover:text-ember">
              {GENRE_PAGES[g].label} mastering →
            </Link>
          ))}
        </div>
        <p className="m-0 mt-6 text-xs uppercase tracking-[0.12em] text-zinc-500">More free tools</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          <Link href={CHORD_DETECTOR_URL} className="text-sm text-brass hover:text-ember">
            Full Chord Detector →
          </Link>
          {otherTools.map((key) => (
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
