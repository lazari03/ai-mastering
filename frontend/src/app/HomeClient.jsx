"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import SiteHeader from "@/components/marketing/SiteHeader";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import Footer from "@/components/Footer";
import { POSTS } from "@/content/posts";
import { useLanguage } from "@/lib/i18n";
import { PLANS, PLAN_ORDER, BILLING_PERIODS, planPricing } from "@/lib/pricing";
import { IconCheck } from "@/components/app/icons";
import { CTA } from "@/lib/internalLinks";
import { BEFORE_AFTER_DEMOS } from "@/lib/beforeAfterDemos";
import BeforeAfterPlayer from "@/components/marketing/BeforeAfterPlayer";
import GenreShowcase from "@/components/marketing/GenreShowcase";
import SectionHeading from "@/components/marketing/SectionHeading";
import MasteringDecisions from "@/components/audio/MasteringDecisions";
import LoudnessMeter from "@/components/audio/LoudnessMeter";
import { LOUDNESS_TARGETS } from "@/content/loudnessTargets";
import { summarizeDecisions } from "@/lib/masteringDecisions";
import { DEMO_MASTER } from "@/content/demoMaster";
import { STUDIO_GROUPS, loc } from "@/lib/studio";
import { trackEvent } from "@/lib/analytics";

// extra carries whatever is worth segmenting a CTA click by — for the
// pricing grid that's the billing period and the exact checkout item, so
// "which plan did people click" and "did the annual toggle change what
// they picked" are answerable without a second event type.
function handleCtaClick(ctaId, location, extra = {}) {
  trackEvent("cta_click", { cta_id: ctaId, location, ...extra });
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
    <div className="break-inside-avoid border-b border-black/[0.07] py-6">
      <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-text-primary">{t(`faq.${qKey}`)}</p>
      <p className="mt-2.5 text-[15px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
        {t(`faq.${aKey}`)}
      </p>
    </div>
  );
}

// Counts for the hero strip, from the same real decisions the
// "how it listens" section renders.
const DEMO_COUNTS = summarizeDecisions(DEMO_MASTER)?.counts || { corrections: 0, untouched: 0 };

export default function HomeClient() {
  const { t, lang } = useLanguage();
  const pricingSectionRef = useRef(null);
  usePricingSectionView(pricingSectionRef);
  const [billing, setBilling] = useState("monthly");

  return (
    <>
    <ScrollReveal />
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-32 pt-4 sm:px-6">
      <SiteHeader />

      {/* Editorial Split: the type block owns the left, the real product
          owns the right. The dark band is the page's one high-contrast
          zone — a radial wash rather than a flat fill, so the corners
          fall off and the panel has something to sit in. The product
          visualization stays on the light tokens and floats on the band
          as a panel, rather than teaching every meter and track colour
          (several are hardcoded bg-black/NN overlays, not tokens) to
          invert for a dark backdrop. */}
      <section id="demo" className="reveal relative -mx-4 scroll-mt-28 px-4 pb-20 pt-12 sm:-mx-6 sm:px-6 sm:pb-[4.5rem] sm:pt-16">
        {/* The band starts far above this section's own top edge so it
            runs up behind the floating nav island to the top of the
            page. A cream strip holding the nav, with the black starting
            underneath it, reads as two mismatched pieces rather than one
            hero. Over-extending upward is safe: above <main> is the top
            of the page, so the excess is simply off-screen.

            It ends on a hard edge — no gradient fade. The fade was doing
            the job the overlapping panel below already does better, and
            a soft dissolve into cream looked like a rendering artifact
            rather than an edge anyone chose. */}
        <div className="absolute -top-[420px] bottom-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-dark-bg" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -top-[420px] bottom-0 left-1/2 -z-10 w-screen -translate-x-1/2"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(1000px 620px at 66% 38%, rgba(130,117,255,0.18), transparent 66%), radial-gradient(760px 460px at 10% 92%, rgba(255,255,255,0.055), transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:items-center lg:gap-20 [&>*]:min-w-0">
          <div>
            <p className="eyebrow m-0 text-dark-text-secondary">{t("hero.eyebrow")}</p>

            {/* Capped at 4.25rem, not the 5.75rem the type scale would
                happily allow: above that this headline wraps to five
                lines at 1440×900 and pushes the primary CTA below the
                fold. A hero that looks impressive and buries its own
                call to action is a worse hero. */}
            <h1
              className="m-0 mt-7 font-[var(--font-title)] text-[clamp(2.5rem,5vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-dark-text-primary"
              style={{ textWrap: "balance" }}
            >
              {t("hero.title1")}
              <span className="block text-dark-text-primary/50">{t("hero.title2")}</span>
            </h1>

            <p className="mt-7 max-w-[50ch] text-[17px] leading-[1.6] text-dark-text-secondary" style={{ textWrap: "pretty" }}>
              {t("hero.body")}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link
                href={CTA.signup}
                onClick={() => handleCtaClick("master_a_track_free", "homepage_hero")}
                className="group flex items-center gap-3 rounded-full bg-dark-text-primary py-2 pl-7 pr-2 text-sm font-semibold text-dark-bg transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                {t("hero.ctaPrimary")}
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-bg/10 text-base transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105"
                >
                  ↗
                </span>
              </Link>
              <a
                href="#demo"
                className="group inline-flex items-center gap-2 text-sm font-medium text-dark-text-primary transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-accent"
              >
                {t("hero.ctaSecondary")}
                <span
                  aria-hidden="true"
                  className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
                >
                  →
                </span>
              </a>
            </div>
            <p className="m-0 mt-4 text-xs text-dark-text-secondary">{t("hero.ctaReassurance")}</p>

            {/* Analyze → Correct → Preserve → Verify: what the engine does,
                instead of spec counts (presets, engines) in the hero. */}
            <ol className="m-0 mt-14 grid list-none grid-cols-2 gap-x-8 gap-y-5 border-t border-dark-border-subtle p-0 pt-9 sm:grid-cols-4">
              {["analyze", "correct", "preserve", "verify"].map((k, i) => (
                <li key={k}>
                  <p className="m-0 font-mono text-[11px] text-dark-text-secondary">{String(i + 1).padStart(2, "0")}</p>
                  <p className="m-0 mt-1.5 text-[15px] font-semibold text-dark-text-primary">{t(`hero.pillar.${k}`)}</p>
                  <p className="m-0 mt-1 text-[12px] leading-snug text-dark-text-secondary">{t(`hero.pillar.${k}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>

          {BEFORE_AFTER_DEMOS[0] ? (
            // Double-bezel: the real player is the inner core, seated in
            // an outer tray with a concentric radius.
            //
            // Sits fully inside the band. An earlier version pushed it
            // past the bottom edge (negative margin to control reserved
            // space, transform to control where it actually sat) so it
            // broke the dark/cream seam as a depth cue — but a panel
            // hanging out of the section it belongs to reads as a
            // layout escaping its container, not as deliberate
            // layering, so the band simply contains it now. Keeping it
            // in flow also means no magic numbers to retune whenever
            // the hero copy changes length.
            <div className="bezel bezel-on-dark relative z-10">
              <div className="bezel-core p-3 sm:p-4">
                <BeforeAfterPlayer large {...BEFORE_AFTER_DEMOS[0]} />
                {/* Real numbers from this demo's own master (content/demoMaster.js),
                    not a genre target dressed up as a measurement. */}
                <dl className="m-0 mt-3 grid grid-cols-3 gap-2 rounded-[1.25rem] bg-black/[0.03] p-4 text-left sm:p-5">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">{t("hero.demo.loudness")}</dt>
                    <dd className="m-0 mt-1 font-mono text-[13px] text-text-primary sm:text-[15px]">
                      {DEMO_MASTER.before_lufs.toFixed(1)} → {DEMO_MASTER.after_lufs.toFixed(1)}
                      <span className="text-text-secondary"> LUFS</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">{t("hero.demo.truePeak")}</dt>
                    <dd className="m-0 mt-1 font-mono text-[13px] text-text-primary sm:text-[15px]">
                      {DEMO_MASTER.analysis_before.true_peak_db.toFixed(1)} → {DEMO_MASTER.analysis_after.true_peak_db.toFixed(1)}
                      <span className="text-text-secondary"> dBTP</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">{t("hero.demo.decisions")}</dt>
                    <dd className="m-0 mt-1 text-[13px] text-text-primary sm:text-[15px]">
                      {t("hero.demo.counts", { c: DEMO_COUNTS.corrections, u: DEMO_COUNTS.untouched })}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section id="how-it-listens" className="reveal mt-24 scroll-mt-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 [&>*]:min-w-0">
          <div>
            <p className="eyebrow m-0">{t("listens.eyebrow")}</p>
            <h2 className="mt-4 font-[var(--font-title)] text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[44px]" style={{ textWrap: "balance" }}>
              {t("listens.title")}
            </h2>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.7] text-text-secondary">{t("listens.body", { c: DEMO_COUNTS.corrections, u: DEMO_COUNTS.untouched })}</p>
            <ol className="m-0 mt-8 flex list-none flex-col gap-4 p-0">
              {["analyze", "master", "verify"].map((k, i) => (
                <li key={k} className="flex gap-4">
                  <span className="font-mono text-[12px] text-text-secondary">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="m-0 text-[16px] font-semibold text-text-primary">{t(`listens.${k}.title`)}</h3>
                    <p className="m-0 mt-1 text-[14px] leading-[1.6] text-text-secondary">{t(`listens.${k}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-[13px] text-text-secondary">{t("listens.note")}</p>
          </div>
          <MasteringDecisions result={DEMO_MASTER} source="homepage_demo" />
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

      <section id="features" className="reveal reveal-delay-1 mt-24 scroll-mt-28 pt-4">
        <SectionHeading eyebrow={t("features.eyebrow")} title={t("features.title")} />

        {/* Asymmetrical bento rather than six equal cards in a 3×2 grid:
            the first and fourth entries take a double-width cell, so the
            eye moves in a Z rather than scanning a uniform table. Every
            span resets to a single column below md — an asymmetric grid
            that survives to phone width is just a broken layout. */}
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-6">
          {FEATURE_KEYS.map((k, idx) => {
            const wide = idx === 0 || idx === 3;
            return (
              <article
                key={k}
                className={`group flex flex-col rounded-[1.75rem] bg-black/[0.035] p-7 ring-1 ring-inset ring-black/[0.05] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.055] sm:p-9 ${
                  wide ? "md:col-span-4" : "md:col-span-2"
                }`}
              >
                <p
                  className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {String(idx + 1).padStart(2, "0")} — {t(`features.${k}.eyebrow`)}
                </p>
                <h3 className="mt-5 font-[var(--font-title)] text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                  {t(`features.${k}.title`)}
                </h3>
                <p className="mt-3.5 max-w-[46ch] text-[15px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
                  {t(`features.${k}.body`)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Full-bleed background tint, not a bordered "card" — a real zone
          change reads as separation at a glance, where the hairline
          border-t elsewhere is easy to miss entirely. Breaks out of
          <main>'s max-w-[1280px] via the classic 100vw + translate-x
          trick; valid here specifically because every section is
          horizontally centered in the viewport (main is mx-auto). */}
      <section className="reveal relative mt-24 pb-[4.5rem] pt-[4.5rem]">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.035]" aria-hidden="true" />
        <SectionHeading eyebrow={t("gallery.eyebrow")} title={t("gallery.title")} />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {GALLERY.map((img) => (
            <Link key={img.slug} href={`/blog/${img.slug}`} className="group relative block">
              {/* The image is a seated core, not a bare rectangle — same
                  tray construction as the panels elsewhere. */}
              <div className="bezel !p-1.5">
                <div className="relative h-64 w-full overflow-hidden rounded-[calc(2rem-0.375rem)]">
                  <Image
                    src={img.src}
                    alt={t(img.captionKey)}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    loading="lazy"
                    className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.06]"
                  />
                </div>
              </div>
              <p className="mt-5 text-[15px] font-medium leading-snug text-text-primary">{t(img.captionKey)}</p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors group-hover:text-accent">
                Read the guide
                <span
                  aria-hidden="true"
                  className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="pricing" ref={pricingSectionRef} className="reveal mt-24 scroll-mt-28 pt-4">
        <SectionHeading eyebrow={t("pricing.eyebrow")} title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

        {/* Monthly / annual switch. Segmented control rather than an
            on-off toggle: a toggle leaves "which side is which" to a
            label the user has to read anyway, while two labelled
            segments make the current state and the alternative both
            visible at once. role=radiogroup (not two buttons) so it is
            announced and arrow-key navigable as one control. */}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <div
            role="radiogroup"
            aria-label={t("pricing.billingLabel")}
            className="inline-flex rounded-full bg-black/[0.055] p-1"
          >
            {BILLING_PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                role="radio"
                aria-checked={billing === period}
                onClick={() => setBilling(period)}
                className={`rounded-full px-5 py-2 text-[13px] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  billing === period ? "bg-bg text-text-primary shadow-[0_1px_2px_rgba(36,32,26,0.06),0_6px_16px_-8px_rgba(36,32,26,0.2)]" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(`pricing.billing.${period}`)}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-text-secondary">{t("pricing.annualSaving")}</span>
        </div>

        {/* Each plan is its own seated panel rather than four cells
            sharing one hairline table. Fixed-height header and blurb
            blocks mean the feature lists all start at the same Y across
            columns, and the CTA is pinned to the bottom (mt-auto) so the
            buttons form one clean line no matter how many features a
            plan lists. */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isFeatured = key === "studio";
            const pricingFor = planPricing(plan, billing);
            return (
              <div key={key} className={`bezel ${isFeatured ? "bg-text-primary/[0.08]" : ""}`}>
                <div className="bezel-core relative flex h-full flex-col p-7 sm:p-8">
                  {isFeatured ? (
                    <span className="absolute right-6 top-7 rounded-full bg-text-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-bg">
                      {t("pricing.badge")}
                    </span>
                  ) : null}

                  <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">{plan.label}</p>

                  <div className="mt-5 flex h-[52px] items-baseline gap-2">
                    <span
                      className="font-[var(--font-title)] text-[42px] font-semibold leading-none tracking-[-0.04em] text-text-primary"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {pricingFor.price}
                    </span>
                    {pricingFor.period ? <span className="text-sm text-text-secondary">{pricingFor.period}</span> : null}
                  </div>

                  {/* Fixed height whether or not a per-month line exists,
                      so the blurb and feature list below stay on the same
                      baseline across all four columns — and so nothing
                      shifts vertically when the billing toggle flips. */}
                  <p className="m-0 h-[18px] text-[12px] text-text-secondary">
                    {pricingFor.perMonth ? t("pricing.perMonthEquivalent").replace("{price}", pricingFor.perMonth) : ""}
                  </p>

                  <p className="mt-3 h-[44px] text-[14px] leading-[1.5] text-text-secondary">{plan.blurb}</p>

                  <ul className="mt-6 flex flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-[14px] leading-[1.45] text-text-primary">
                        <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                          <IconCheck />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-8">
                    <Link
                      href={CTA.signup}
                      onClick={() =>
                        handleCtaClick(key === "free" ? "pricing_free_cta" : `pricing_${key}_cta`, "homepage_pricing", {
                          billing,
                          item: pricingFor.item,
                        })
                      }
                      className={`group flex items-center justify-between rounded-full py-2 pl-6 pr-2 text-sm font-semibold transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${
                        isFeatured ? "bg-text-primary text-bg" : "bg-black/[0.055] text-text-primary"
                      }`}
                    >
                      {key === "free" ? t("pricing.freeCta") : t("pricing.subCta")}
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px ${
                          isFeatured ? "bg-bg/15" : "bg-black/[0.06]"
                        }`}
                      >
                        ↗
                      </span>
                    </Link>
                    {key !== "free" ? (
                      <p className="mt-3 text-center text-[11px] text-text-secondary">{t("pricing.subReassurance")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Link
          href="/ai-mastering-online"
          className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-text-primary transition-colors hover:text-accent"
        >
          {t("pricing.compareLink")}
          <span aria-hidden="true" className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1">
            →
          </span>
        </Link>
      </section>

      <section id="how-to" className="reveal reveal-delay-2 relative mt-24 scroll-mt-28 pb-[4.5rem] pt-[4.5rem]">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.035]" aria-hidden="true" />
        <SectionHeading eyebrow={t("howTo.eyebrow")} title={t("howTo.title")} subtitle={t("howTo.subtitle")} />

        {/* Signal-chain layout — a thin connecting rule behind the steps,
            a pipeline rather than a disconnected checklist. */}
        <div className="relative mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="pointer-events-none absolute inset-x-0 top-[21px] hidden h-px bg-black/[0.09] lg:block" aria-hidden="true" />
          {STEP_KEYS.map((k, idx) => (
            <div key={k} className="relative">
              <div
                className="relative flex h-11 w-11 items-center justify-center rounded-full bg-bg font-mono text-[13px] font-semibold text-text-primary shadow-[0_1px_2px_rgba(36,32,26,0.05),0_8px_20px_-8px_rgba(36,32,26,0.18)] ring-1 ring-inset ring-black/[0.06]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {idx + 1}
              </div>
              <h3 className="m-0 mt-5 text-[15px] font-semibold leading-snug text-text-primary">{t(`howTo.${k}.title`)}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-text-secondary" style={{ textWrap: "pretty" }}>
                {t(`howTo.${k}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Auralith Studio — every real tool, grouped by what the musician is
          doing, with descriptive anchors (also the clearest map of the
          site's hierarchy for search engines). From lib/studio.js. */}
      <section id="studio" className="reveal mt-24 scroll-mt-28">
        <SectionHeading eyebrow={t("studioHome.eyebrow")} title={t("studioHome.title")} subtitle={t("studioHome.body")} />
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STUDIO_GROUPS.map((group) => (
            <div key={group.key}>
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{loc(group.label, lang)}</h3>
              <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
                {group.tools.map((tool) => (
                  <li key={tool.key}>
                    <Link href={tool.href} className="group block rounded-xl border border-border-subtle bg-white/55 p-4 transition hover:border-text-primary/30 hover:bg-white">
                      <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-text-primary">
                        {loc(tool.name, lang)}
                        {tool.appOnly ? <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-medium text-text-secondary">{t("nav.appOnly")}</span> : null}
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-text-secondary">{loc(tool.blurb, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <GenreShowcase />

      <section id="faq" className="reveal mt-24 scroll-mt-28">
        <SectionHeading eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
        <div className="mt-10 columns-1 sm:columns-2 sm:gap-14">
          {FAQ_KEYS.map((k) => (
            <FaqItem key={k} t={t} qKey={k} />
          ))}
        </div>
      </section>

      {/* Closes the visible/white rhythm on a visible band (faq above is
          the last white section) instead of ending on two whites in a
          row — same full-bleed tint technique as Gallery/How-to/Genre
          Showcase. */}
      <section id="contact" className="reveal relative mt-24 scroll-mt-28 pb-[4.5rem] pt-[4.5rem]">
        <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.035]" aria-hidden="true" />
        <SectionHeading eyebrow={t("contact.eyebrow")} title={t("contact.title")} subtitle={t("contact.body")} />
        <p className="mt-8 text-[15px] text-text-primary">
          {t("contact.emailLabel")}:{" "}
          <a
            href="mailto:studio@auralithforge.app"
            className="text-text-primary underline decoration-black/20 underline-offset-[5px] transition-colors hover:text-accent hover:decoration-accent/40"
          >
            studio@auralithforge.app
          </a>
        </p>
      </section>

    </main>
    <Footer />
    </>
  );
}
