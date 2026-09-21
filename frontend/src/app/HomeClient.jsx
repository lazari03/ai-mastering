"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

import SiteHeader from "@/components/marketing/SiteHeader";
import Footer from "@/components/Footer";
import { POSTS } from "@/content/posts";
import { useLanguage } from "@/lib/i18n";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { IconCheck } from "@/components/app/icons";
import { CTA } from "@/lib/internalLinks";
import { BEFORE_AFTER_DEMOS } from "@/lib/beforeAfterDemos";
import BeforeAfterPlayer from "@/components/marketing/BeforeAfterPlayer";
import LoudnessMeter from "@/components/audio/LoudnessMeter";
import { LOUDNESS_TARGETS } from "@/content/loudnessTargets";
import GenreShowcase from "@/components/marketing/GenreShowcase";
import SectionHeading from "@/components/marketing/SectionHeading";
import TruePeakMeter from "@/components/audio/TruePeakMeter";
import { trackEvent } from "@/lib/analytics";

function handleCtaClick(ctaId, location) {
  trackEvent("cta_click", { cta_id: ctaId, location });
}

// Fires pricing_view once the homepage's #pricing section actually enters
// view, not just on page load — most visitors never scroll that far, so a
// mount-time fire would wildly overcount "viewed pricing" against the
// in-app Plans tab's (real) mount-time fire.
function usePricingSectionView(ref) {
  const fired = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired.current) {
          fired.current = true;
          trackEvent("pricing_view", { source: "homepage" });
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
}

const FEATURE_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];
const STEP_KEYS = ["s1", "s2", "s3", "s4", "s5"];
const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];

// Gallery images double as entry points into the blog posts (POSTS[i]) —
// keeps the SEO benefit (real indexable articles) attached to the same
// visual the user already clicks on.
const GALLERY = POSTS.map((post) => ({
  src: post.image.replace("w=1200", "w=800"),
  captionKey: post.captionKey,
  slug: post.slug,
}));

// Plain, always-visible Q&A rather than an accordion — every question's
// answer is short enough (see i18n.js's faq.* copy) that hiding it behind
// a click costs a real tap/click for no real space saved, and an
// always-open list reads as content, not as a hidden-until-clicked
// interaction pattern.
function FaqItem({ t, qKey }) {
  const aKey = qKey.replace("q", "a");
  return (
    <div className="break-inside-avoid border-b border-border-subtle py-4">
      <p className="text-[15px] font-medium text-text-primary">{t(`faq.${qKey}`)}</p>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t(`faq.${aKey}`)}</p>
    </div>
  );
}

export default function HomeClient() {
  const { t } = useLanguage();
  const pricingSectionRef = useRef(null);
  usePricingSectionView(pricingSectionRef);

  return (
    <>
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-5 sm:px-6">
      <SiteHeader />

      {/* The hero is the first "visible" band in the page's alternating
          visible/white rhythm (see the tinted full-bleed sections further
          down) — a real dark zone-change right at the top, not just a
          hairline, so the page reads as designed instead of "all white"
          from the first screen. Full-bleed via the same 100vw breakout
          trick the tinted sections below use; --dark-* are the existing
          dark-palette tokens (globals.css), not a new color introduced
          for this. The product visualization stays on the light tokens
          (bg-bg/text-primary etc.) and floats on the dark band as a
          panel — cheaper and lower-risk than teaching every meter/track
          color (several are hardcoded bg-black/NN overlays, not tokens)
          to invert for a dark backdrop. */}
      <section id="demo" className="reveal relative -mx-4 scroll-mt-24 px-4 pb-24 pt-14 sm:-mx-6 sm:px-6 sm:pb-28 sm:pt-16">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-dark-bg" aria-hidden="true" />
        {/* Fades to --bg at the bottom edge instead of cutting straight to
            white — a hard dark-to-light seam reads as an accidental
            copy-paste, a gradient reads as an intentional zone change. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 left-1/2 -z-10 h-24 w-screen -translate-x-1/2 bg-gradient-to-b from-transparent to-bg sm:h-32"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.85fr_1fr] lg:items-center lg:gap-16">
          <div>
            <p className="m-0 mb-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.26em] text-dark-text-secondary">
              <span className="h-px w-6 bg-accent" aria-hidden="true" />
              {t("hero.eyebrow")}
            </p>
            <h1 className="m-0 max-w-[560px] text-[44px] font-semibold leading-[1.02] tracking-tight text-dark-text-primary sm:text-6xl md:text-[72px]">
              {t("hero.title1")}
              <span className="block">{t("hero.title2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-dark-text-secondary sm:text-lg">{t("hero.body")}</p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Link
                href={CTA.signup}
                onClick={() => handleCtaClick("master_a_track_free", "homepage_hero")}
                className="rounded-full bg-dark-text-primary px-8 py-4 text-sm font-semibold text-dark-bg transition hover:scale-[1.02] hover:opacity-85 active:scale-[0.98]"
              >
                {t("hero.ctaPrimary")}
              </Link>
              <a href="#demo" className="inline-flex items-center gap-1.5 text-sm font-medium text-dark-text-primary hover:text-accent">
                {t("hero.ctaSecondary")} <span aria-hidden="true">→</span>
              </a>
            </div>
            <p className="m-0 mt-3 text-xs text-dark-text-secondary">{t("hero.ctaReassurance")}</p>

            <div className="mt-12 flex flex-wrap gap-x-10 gap-y-6 border-t border-dark-border-subtle pt-8">
              {["stat1", "stat2", "stat3"].map((s) => (
                <div key={s}>
                  <p className="m-0 font-mono text-3xl text-dark-text-primary">{t(`hero.${s}.value`)}</p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-dark-text-secondary">{t(`hero.${s}.label`)}</p>
                </div>
              ))}
            </div>
          </div>

          {BEFORE_AFTER_DEMOS[0] ? (
            // Overlaps the section's own bottom edge on large screens
            // instead of sitting flush inside it — a real depth cue
            // (the panel physically breaks the dark/light seam) rather
            // than two flat zones stacked next to each other. Plenty of
            // clearance below: #features starts at mt-32.
            <div className="relative z-10 rounded-3xl bg-bg p-3 shadow-2xl sm:p-4 lg:-mb-16">
              <BeforeAfterPlayer large {...BEFORE_AFTER_DEMOS[0]} />
              {(() => {
                const heroTarget = LOUDNESS_TARGETS.find((g) => g.genre === BEFORE_AFTER_DEMOS[0].genre.toLowerCase());
                return heroTarget ? (
                  <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-border-subtle p-5 sm:flex-row sm:items-end sm:gap-6">
                    <LoudnessMeter className="sm:flex-1" label={t("hero.consoleLoudness")} targetLufs={heroTarget.targetLufs} />
                    <TruePeakMeter label={t("hero.consoleCeiling")} />
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
        </div>
      </section>

      {/* The hero above already shows BEFORE_AFTER_DEMOS[0] — this section
          is for ADDITIONAL genre examples only (slice(1)), never a repeat
          of the hero's own demo. Renders nothing at all while only one
          demo exists (see beforeAfterDemos.js's own comment: "add more
          entries once more real mastered pairs exist") rather than
          duplicating it or showing an empty heading with no players. */}
      {BEFORE_AFTER_DEMOS.length > 1 ? (
        <section className="reveal mt-32 border-t border-border-subtle pt-20">
          <SectionHeading eyebrow={t("demo.eyebrow")} title={t("demo.title")} subtitle={t("demo.body")} />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BEFORE_AFTER_DEMOS.slice(1).map((demo) => {
              // Real per-genre target, same table the DSP engine itself is
              // built from — not a fabricated number attached to the demo.
              const target = LOUDNESS_TARGETS.find((g) => g.genre === demo.genre.toLowerCase());
              return (
                <div key={demo.label}>
                  <BeforeAfterPlayer {...demo} />
                  {target ? (
                    <LoudnessMeter
                      className="mt-3"
                      label={t("demo.target")}
                      targetLufs={target.targetLufs}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section id="features" className="reveal reveal-delay-1 mt-32 scroll-mt-24 border-t border-border-subtle pt-20">
        <SectionHeading eyebrow={t("features.eyebrow")} title={t("features.title")} />
        {/* Editorial list, not six illustrated cards — a thin divider
            between rows carries the structure, typography carries the
            hierarchy. */}
        <div className="mt-8 grid divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-3">
          {FEATURE_KEYS.map((k, idx) => (
            <article key={k} className="py-7 pr-6 sm:px-6 sm:first:pl-0">
              <p className="relative m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                {String(idx + 1).padStart(2, "0")} — {t(`features.${k}.eyebrow`)}
              </p>
              <h3 className="relative mt-2.5 text-xl font-semibold text-text-primary">{t(`features.${k}.title`)}</h3>
              <p className="relative mt-2.5 text-sm leading-relaxed text-text-secondary">{t(`features.${k}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Full-bleed background tint, not a bordered "card" — a real zone
          change reads as separation at a glance, where the hairline
          border-t elsewhere is easy to miss entirely. Breaks out of
          <main>'s max-w-[1280px] via the classic 100vw + translate-x
          trick; valid here specifically because every section is
          horizontally centered in the viewport (main is mx-auto). */}
      <section className="reveal relative mt-32 pt-20 pb-20">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.03]" aria-hidden="true" />
        <SectionHeading eyebrow={t("gallery.eyebrow")} title={t("gallery.title")} />
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {GALLERY.map((img) => (
            <Link key={img.slug} href={`/blog/${img.slug}`} className="group relative block">
              <div className="relative h-56 w-full overflow-hidden rounded-xl">
                <Image
                  src={img.src}
                  alt={t(img.captionKey)}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  loading="lazy"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">{t(img.captionKey)}</p>
              <span className="mt-0.5 block text-xs text-text-secondary group-hover:text-accent">Read the guide →</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="pricing" ref={pricingSectionRef} className="reveal mt-32 scroll-mt-24 border-t border-border-subtle pt-20">
        <SectionHeading eyebrow={t("pricing.eyebrow")} title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

        {/* Thin borders + typography, no colorful glowing cards — the
            featured plan gets a heavier (2px, full-height) border instead
            of a gradient/glow treatment. */}
        <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle lg:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isFeatured = key === "pro";
            return (
              <div key={key} className={`relative bg-bg p-8 ${isFeatured ? "ring-1 ring-inset ring-text-primary" : ""}`}>
                {isFeatured ? (
                  <span className="absolute right-6 top-6 rounded-full bg-text-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-bg">
                    {t("pricing.badge")}
                  </span>
                ) : null}

                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{plan.label}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold text-text-primary">{plan.price}</span>
                  {plan.period ? <span className="text-sm text-text-secondary">{plan.period}</span> : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{plan.blurb}</p>

                <div className="mt-6 border-t border-border-subtle" />

                <ul className="mt-5 flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-text-primary">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-text-primary">
                        <IconCheck />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={CTA.signup}
                  onClick={() => handleCtaClick(key === "free" ? "pricing_free_cta" : `pricing_${key}_cta`, "homepage_pricing")}
                  className={`mt-6 block rounded-full px-6 py-3.5 text-center text-sm font-semibold transition hover:scale-[1.02] active:scale-[0.98] ${
                    isFeatured ? "bg-text-primary text-bg hover:opacity-85" : "border border-border-subtle text-text-primary hover:border-text-primary/40"
                  }`}
                >
                  {key === "free" ? t("pricing.freeCta") : t("pricing.subCta")}
                </Link>
                {key !== "free" ? <p className="mt-2.5 text-center text-[11px] text-text-secondary">{t("pricing.subReassurance")}</p> : null}
              </div>
            );
          })}
        </div>

        <Link href="/ai-mastering-online" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent">
          {t("pricing.compareLink")}
        </Link>
      </section>

      <section id="how-to" className="reveal reveal-delay-2 relative mt-32 scroll-mt-24 pt-20 pb-20">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.03]" aria-hidden="true" />
        <SectionHeading eyebrow={t("howTo.eyebrow")} title={t("howTo.title")} subtitle={t("howTo.subtitle")} />

        {/* Signal-chain layout — a thin connecting rule behind the steps,
            a pipeline rather than a disconnected checklist. */}
        <div className="relative mt-9 grid grid-cols-2 gap-x-2.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <div className="pointer-events-none absolute inset-x-0 top-[18px] hidden h-px bg-border-subtle lg:block" aria-hidden="true" />
          {STEP_KEYS.map((k, idx) => (
            <div key={k} className="relative">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg font-mono text-xs font-semibold text-text-primary">
                {idx + 1}
              </div>
              <h3 className="m-0 mt-3 text-[13px] font-semibold text-text-primary">{t(`howTo.${k}.title`)}</h3>
              <p className="mt-1 text-xs leading-snug text-text-secondary">{t(`howTo.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal mt-32 border-t border-border-subtle pt-20">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="m-0 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-text-secondary">
              <span className="h-px w-5 bg-accent" aria-hidden="true" />
              {t("crossPromo.eyebrow")}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{t("crossPromo.title")}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">{t("crossPromo.body")}</p>
          </div>
          <Link href="/chord-detector" className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent">
            {t("crossPromo.cta")}
          </Link>
        </div>
      </section>

      <GenreShowcase />

      <section id="faq" className="reveal mt-32 scroll-mt-24 border-t border-border-subtle pt-20">
        <SectionHeading eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
        <div className="mt-8 columns-1 sm:columns-2 sm:gap-12">
          {FAQ_KEYS.map((k) => (
            <FaqItem key={k} t={t} qKey={k} />
          ))}
        </div>
      </section>

      {/* Closes the visible/white rhythm on a visible band (faq above is
          the last white section) instead of ending on two whites in a
          row — same full-bleed tint technique as Gallery/How-to/Genre
          Showcase. */}
      <section id="contact" className="reveal relative mt-32 scroll-mt-24 pt-20 pb-20">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.03]" aria-hidden="true" />
        <SectionHeading eyebrow={t("contact.eyebrow")} title={t("contact.title")} />
        <p className="mt-4 max-w-xl text-base leading-relaxed text-text-secondary">{t("contact.body")}</p>
        <p className="mt-4 text-sm text-text-primary">
          {t("contact.emailLabel")}:{" "}
          <a href="mailto:studio@auralithforge.app" className="text-text-primary underline decoration-border-subtle underline-offset-4 hover:text-accent">
            studio@auralithforge.app
          </a>
        </p>
      </section>

    </main>
    <Footer />
    </>
  );
}
