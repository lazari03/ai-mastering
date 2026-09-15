"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

import SiteHeader from "@/components/marketing/SiteHeader";
import DeferredThreads from "@/components/reactbits/DeferredThreads";
import Footer from "@/components/Footer";
import { POSTS } from "@/content/posts";
import { useLanguage } from "@/lib/i18n";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { IconCheck } from "@/components/app/icons";
import { CTA } from "@/lib/internalLinks";
import { BEFORE_AFTER_DEMOS } from "@/lib/beforeAfterDemos";
import BeforeAfterPlayer from "@/components/marketing/BeforeAfterPlayer";
import SpectrumAnalyzer from "@/components/audio/SpectrumAnalyzer";
import LoudnessMeter from "@/components/audio/LoudnessMeter";
import { LOUDNESS_TARGETS } from "@/content/loudnessTargets";
import GenreShowcase from "@/components/marketing/GenreShowcase";
import SectionHeading from "@/components/marketing/SectionHeading";
import TruePeakMeter from "@/components/audio/TruePeakMeter";
import { trackEvent } from "@/lib/analytics";

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

function FaqItem({ t, qKey }) {
  const [open, setOpen] = useState(false);
  const aKey = qKey.replace("q", "a");
  return (
    <div className="break-inside-avoid rounded-xl border border-white/10 bg-black/20 p-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[13px] font-semibold text-white">{t(`faq.${qKey}`)}</span>
        <span className={`shrink-0 text-brass transition-transform duration-200 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {/* Animated height expand/collapse instead of an instant appear/
          vanish — overflow-hidden on the animating wrapper is what makes
          a height animation actually clip during the transition. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{t(`faq.${aKey}`)}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
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

      <section
        className="reveal relative mt-6 overflow-hidden rounded-[28px] border border-white/10 p-8 sm:p-14 md:p-16"
        style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}
      >
        <div className="absolute inset-0">
          <DeferredThreads color={[0.9, 0.55, 0.25]} amplitude={1.05} distance={0.1} enableMouseInteraction />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/80" />

        <div className="relative grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="m-0 mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-zinc-400">
              <span className="h-px w-6 bg-ember" aria-hidden="true" />
              {t("hero.eyebrow")}
            </p>
            <h1 className="m-0 max-w-[640px] font-[var(--font-title)] text-5xl leading-[0.98] tracking-tight text-white sm:text-6xl md:text-[68px]">
              {t("hero.title1")}
              <span className="block text-ember">{t("hero.title2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t("hero.body")}</p>
            <div className="mt-10 flex flex-wrap gap-3.5">
              <Link href={CTA.signup} className="rounded-2xl bg-ember px-8 py-4 text-sm font-bold uppercase tracking-[0.1em] text-[#100b08] transition hover:brightness-110">
                {t("hero.ctaPrimary")}
              </Link>
              <a href="#demo" className="rounded-2xl border border-white/20 bg-black/20 px-8 py-4 text-sm font-semibold uppercase tracking-[0.1em] text-white transition hover:border-white/40">
                {t("hero.ctaSecondary")}
              </a>
            </div>
            <p className="m-0 mt-3 text-xs text-zinc-500">{t("hero.ctaReassurance")}</p>

            <div className="mt-12 flex flex-wrap gap-x-10 gap-y-6 border-t border-white/10 pt-8">
              {["stat1", "stat2", "stat3"].map((s) => (
                <div key={s}>
                  <p className="m-0 font-mono text-3xl text-brass">{t(`hero.${s}.value`)}</p>
                  <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">{t(`hero.${s}.label`)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* A real console readout, not a screenshot or a mockup: the
              same SpectrumAnalyzer/LoudnessMeter/TruePeakMeter used
              throughout the site, fed by the same real mastered clip as
              #demo below and Pop's actual target profile from
              loudnessTargets.js. Decorative/illustrative (never audible,
              never a functional transport — that's #demo), but every
              number on it is real. */}
          {BEFORE_AFTER_DEMOS[0] ? (
            <div className="rounded-[22px] border border-white/10 bg-black/40 p-5 backdrop-blur-sm sm:p-6">
              <div className="flex items-center justify-between">
                <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" aria-hidden="true" />
                  {t("hero.liveSignal")}
                </p>
                <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
                  {BEFORE_AFTER_DEMOS[0].genre}
                </span>
              </div>
              <SpectrumAnalyzer
                src={BEFORE_AFTER_DEMOS[0].afterSrc}
                bars={56}
                className="mt-4 h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:h-40"
              />
              {(() => {
                const heroTarget = LOUDNESS_TARGETS.find((g) => g.genre === BEFORE_AFTER_DEMOS[0].genre.toLowerCase());
                return heroTarget ? (
                  <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
                    <LoudnessMeter className="sm:flex-1" label={t("hero.consoleLoudness")} targetLufs={heroTarget.targetLufs} />
                    <TruePeakMeter label={t("hero.consoleCeiling")} />
                  </div>
                ) : null;
              })()}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="demo"
        className="reveal mt-24 scroll-mt-24 rounded-[28px] border border-border-subtle p-6 sm:p-10"
        style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
      >
        <SectionHeading eyebrow={t("demo.eyebrow")} title={t("demo.title")} subtitle={t("demo.body")} />
        <div className={`mt-8 grid gap-4 ${BEFORE_AFTER_DEMOS.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3" : ""}`}>
          {BEFORE_AFTER_DEMOS.map((demo) => {
            // Real per-genre target, same table the DSP engine itself is
            // built from — not a fabricated number attached to the demo.
            const target = LOUDNESS_TARGETS.find((g) => g.genre === demo.genre.toLowerCase());
            return (
              <div key={demo.label}>
                <BeforeAfterPlayer large={BEFORE_AFTER_DEMOS.length === 1} {...demo} />
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

      <section id="features" className="reveal reveal-delay-1 mt-24 scroll-mt-24">
        <SectionHeading eyebrow={t("features.eyebrow")} title={t("features.title")} />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((k, idx) => (
            <article
              key={k}
              className="group relative overflow-hidden rounded-[20px] border border-white/10 p-7 transition duration-300 hover:-translate-y-1 hover:border-ember/40"
              style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
            >
              <span
                className="pointer-events-none absolute -right-2 -top-4 select-none font-[var(--font-title)] text-7xl font-bold text-white/[0.04] transition group-hover:text-ember/[0.08]"
                aria-hidden="true"
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <p className="relative m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">{t(`features.${k}.eyebrow`)}</p>
              <h3 className="relative mt-2.5 font-[var(--font-title)] text-xl">{t(`features.${k}.title`)}</h3>
              <p className="relative mt-2.5 text-sm leading-relaxed text-zinc-300">{t(`features.${k}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mt-24">
        <SectionHeading eyebrow={t("gallery.eyebrow")} title={t("gallery.title")} />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {GALLERY.map((img) => (
            <Link
              key={img.slug}
              href={`/blog/${img.slug}`}
              className="group relative block overflow-hidden rounded-[20px] border border-white/10"
            >
              <div className="relative h-56 w-full overflow-hidden">
                <Image
                  src={img.src}
                  alt={t(img.captionKey)}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  loading="lazy"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 text-sm font-medium text-white">
                {t(img.captionKey)}
                <span className="mt-0.5 block text-[11px] font-normal text-brass opacity-0 transition group-hover:opacity-100">
                  Read the guide →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="pricing" ref={pricingSectionRef} className="reveal mt-24 scroll-mt-24">
        <SectionHeading eyebrow={t("pricing.eyebrow")} title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isFeatured = key === "pro";
            return (
              <div
                key={key}
                className={`relative overflow-hidden rounded-[28px] p-8 ${
                  isFeatured ? "border border-brass/40" : "border border-white/10"
                }`}
                style={
                  isFeatured
                    ? { background: "linear-gradient(160deg, rgba(223,201,90,.14), rgba(15,17,19,.94))", boxShadow: "0 20px 60px rgba(223,201,90,.08)" }
                    : { background: "rgba(15,17,19,.7)" }
                }
              >
                {isFeatured ? (
                  <span className="absolute right-6 top-6 rounded-full border border-brass/50 bg-brass/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brass">
                    {t("pricing.badge")}
                  </span>
                ) : null}

                <p className={`m-0 font-mono text-[11px] uppercase tracking-[0.16em] ${isFeatured ? "text-brass" : "text-zinc-400"}`}>{plan.label}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-5xl text-white">{plan.price}</span>
                  {plan.period ? <span className="text-sm text-zinc-400">{plan.period}</span> : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">{plan.blurb}</p>

                <div className="mt-6 border-t border-white/10" />

                <ul className="mt-5 flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-200">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isFeatured ? "bg-brass/20 text-brass" : "bg-white/10 text-zinc-300"}`}
                      >
                        <IconCheck />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={CTA.signup}
                  className={`mt-6 block rounded-2xl px-6 py-3.5 text-center text-sm font-bold uppercase tracking-[0.1em] transition ${
                    isFeatured
                      ? "bg-brass text-[#100b08] hover:brightness-110"
                      : "border border-white/15 bg-white/[0.04] text-white hover:border-white/30"
                  }`}
                >
                  {key === "free" ? t("pricing.freeCta") : t("pricing.subCta")}
                </Link>
                {key !== "free" ? <p className="mt-2.5 text-center text-[11px] text-zinc-500">{t("pricing.subReassurance")}</p> : null}
              </div>
            );
          })}
        </div>

        <Link href="/ai-mastering-online" className="mt-5 inline-block text-sm text-brass hover:text-ember">
          {t("pricing.compareLink")}
        </Link>
      </section>

      <section id="how-to" className="reveal reveal-delay-2 mt-24 scroll-mt-24">
        <SectionHeading eyebrow={t("howTo.eyebrow")} title={t("howTo.title")} subtitle={t("howTo.subtitle")} />

        <div className="relative mt-9 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {/* A thin connecting rule behind the steps — a pipeline, not a
              disconnected checklist. */}
          <div className="pointer-events-none absolute inset-x-0 top-[18px] hidden h-px bg-gradient-to-r from-transparent via-white/10 to-transparent lg:block" aria-hidden="true" />
          {STEP_KEYS.map((k, idx) => (
            <div key={k} className="relative rounded-xl border border-white/10 bg-black/20 p-3.5">
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold"
                style={{ border: "1px solid rgba(232,93,42,.4)", color: "var(--ember)" }}
              >
                {idx + 1}
              </div>
              <h3 className="m-0 mt-3 text-[13px] font-semibold text-white">{t(`howTo.${k}.title`)}</h3>
              <p className="mt-1 text-xs leading-snug text-zinc-400">{t(`howTo.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal mt-24 scroll-mt-24 rounded-[24px] border border-white/10 p-6 sm:p-9">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-brass">
              <span className="h-px w-5 bg-ember" aria-hidden="true" />
              {t("crossPromo.eyebrow")}
            </p>
            <h2 className="mt-3 font-[var(--font-title)] text-2xl tracking-tight text-white sm:text-3xl">{t("crossPromo.title")}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{t("crossPromo.body")}</p>
          </div>
          <Link
            href="/chord-detector"
            className="shrink-0 rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            {t("crossPromo.cta")}
          </Link>
        </div>
      </section>

      <GenreShowcase />

      <section id="faq" className="reveal mt-24 scroll-mt-24">
        <SectionHeading eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
        <div className="mt-8 columns-1 gap-3 sm:columns-2 [&>*]:mb-3">
          {FAQ_KEYS.map((k) => (
            <FaqItem key={k} t={t} qKey={k} />
          ))}
        </div>
      </section>

      <section
        id="contact"
        className="reveal mt-24 scroll-mt-24 rounded-[28px] border border-white/10 p-8 sm:p-14"
        style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
      >
        <SectionHeading eyebrow={t("contact.eyebrow")} title={t("contact.title")} />
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-300">{t("contact.body")}</p>
        <p className="mt-4 text-sm text-zinc-300">
          {t("contact.emailLabel")}:{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">
            studio@auralithforge.app
          </a>
        </p>
      </section>

    </main>
    <Footer />
    </>
  );
}
