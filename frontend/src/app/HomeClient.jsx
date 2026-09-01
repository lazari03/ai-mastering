"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import DeferredThreads from "@/components/reactbits/DeferredThreads";
import Footer from "@/components/Footer";
import { POSTS } from "@/content/posts";
import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { useLanguage } from "@/lib/i18n";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { IconCheck } from "@/components/app/icons";
import { CTA } from "@/lib/internalLinks";
import { BEFORE_AFTER_DEMOS } from "@/lib/beforeAfterDemos";
import BeforeAfterPlayer from "@/components/marketing/BeforeAfterPlayer";

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
  const { lang, setLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: "#features", key: "nav.features" },
    { href: "#pricing", key: "nav.pricing" },
    { href: "#how-to", key: "nav.howTo" },
    { href: "#faq", key: "nav.faq" },
    { href: "/blog", key: "nav.blog" },
    { href: "#contact", key: "nav.contact" },
  ];

  return (
    <>
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-5 sm:px-6">
      <header className="sticky top-0 z-40 -mx-4 mb-2 border-b border-white/10 bg-[#0b0d10]/80 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-[var(--font-title)] text-[13px] uppercase tracking-[0.22em] text-brass">
              Auralith Forge
            </span>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <a key={link.key} href={link.href} className="text-[13px] text-zinc-300 hover:text-white">
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitch lang={lang} setLang={setLang} />
            <Link href={CTA.signup} className="text-[13px] text-zinc-300 hover:text-white">
              {t("nav.signin")}
            </Link>
            <Link
              href={CTA.signup}
              className="rounded-full border border-brass/50 bg-brass/[0.15] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass transition hover:bg-brass/25"
            >
              {t("nav.openApp")}
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={t("app.menu")}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/20 md:hidden"
          >
            <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`} />
            <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>
      </header>

      {/* Mobile menu — a real slide-in drawer (fixed overlay + backdrop +
          translate-x animation), same pattern /app's own sidebar drawer
          uses. Replaces the old inline dropdown that just pushed the rest
          of the page down instead of overlaying it. Rendered
          unconditionally (not `menuOpen ? ... : null`) so the closing
          animation can actually play. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col border-l border-white/10 bg-[#14110f] p-5 shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between pb-6">
            <div className="flex items-center gap-2.5">
              <LogoMark size={22} />
              <span className="font-[var(--font-title)] text-xs uppercase tracking-[0.18em] text-brass">
                Auralith Forge
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("app.closeMenu")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-lg text-zinc-300"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3.5 py-3 text-left text-sm font-semibold uppercase tracking-[0.1em] text-zinc-300 active:bg-white/5"
              >
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="border-t border-white/10 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Link href={CTA.signup} onClick={() => setMenuOpen(false)} className="text-xs text-zinc-400">
                {t("nav.signin")}
              </Link>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <Link
              href={CTA.signup}
              onClick={() => setMenuOpen(false)}
              className="block w-full rounded-full border border-brass/50 bg-brass/[0.15] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-brass"
            >
              {t("nav.openApp")}
            </Link>
          </div>
        </div>
      </div>

      <section
        className="reveal relative mt-6 overflow-hidden rounded-[28px] border border-white/10 p-8 sm:p-12 md:p-16"
        style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}
      >
        <div className="absolute inset-0">
          <DeferredThreads color={[0.9, 0.55, 0.25]} amplitude={1.05} distance={0.1} enableMouseInteraction />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/80" />

        <div className="relative">
          <p className="m-0 mb-4 text-[11px] uppercase tracking-[0.24em] text-zinc-400">{t("hero.eyebrow")}</p>
          <h1 className="m-0 max-w-[680px] font-[var(--font-title)] text-4xl leading-[1.05] text-white sm:text-5xl md:text-6xl">
            {t("hero.title1")}
            <span className="block text-ember">{t("hero.title2")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-300">{t("hero.body")}</p>
          <div className="mt-9 flex flex-wrap gap-3.5">
            <Link href={CTA.signup} className="rounded-2xl bg-ember px-8 py-4 text-sm font-bold uppercase tracking-[0.1em] text-[#100b08] transition hover:brightness-110">
              {t("hero.ctaPrimary")}
            </Link>
            <a href="#features" className="rounded-2xl border border-white/20 bg-black/20 px-8 py-4 text-sm font-semibold uppercase tracking-[0.1em] text-white transition hover:border-white/40">
              {t("hero.ctaSecondary")}
            </a>
          </div>
          <p className="m-0 mt-3 text-xs text-zinc-500">{t("hero.ctaReassurance")}</p>

          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8 sm:max-w-md">
            {["stat1", "stat2", "stat3"].map((s) => (
              <div key={s}>
                <p className="m-0 font-[var(--font-title)] text-2xl text-brass">{t(`hero.${s}.value`)}</p>
                <p className="mt-1 text-xs text-zinc-400">{t(`hero.${s}.label`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="reveal mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("demo.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("demo.title")}</h2>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">{t("demo.body")}</p>
        <div className={`mt-6 grid gap-4 ${BEFORE_AFTER_DEMOS.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3" : ""}`}>
          {BEFORE_AFTER_DEMOS.map((demo) => (
            <BeforeAfterPlayer key={demo.label} large={BEFORE_AFTER_DEMOS.length === 1} {...demo} />
          ))}
        </div>
      </section>

      <section id="features" className="reveal reveal-delay-1 mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("features.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("features.title")}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((k) => (
            <article
              key={k}
              className="rounded-[20px] border border-white/10 p-6"
              style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
            >
              <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{t(`features.${k}.eyebrow`)}</p>
              <h3 className="mt-2.5 font-[var(--font-title)] text-[20px]">{t(`features.${k}.title`)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-zinc-300">{t(`features.${k}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mt-16">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("gallery.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("gallery.title")}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
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

      <section id="pricing" className="reveal mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("pricing.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("pricing.title")}</h2>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">{t("pricing.subtitle")}</p>

        <div className="mt-7 grid gap-5 lg:grid-cols-3">
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

                <p className={`m-0 text-[11px] uppercase tracking-[0.16em] ${isFeatured ? "text-brass" : "text-zinc-400"}`}>{plan.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-[var(--font-title)] text-4xl text-white">{plan.price}</span>
                  {plan.period ? <span className="text-sm text-zinc-400">{plan.period}</span> : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">{plan.blurb}</p>

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

      <section id="how-to" className="reveal reveal-delay-2 mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("howTo.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("howTo.title")}</h2>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">{t("howTo.subtitle")}</p>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {STEP_KEYS.map((k, idx) => (
            <div key={k} className="rounded-xl border border-white/10 bg-black/20 p-3.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full font-[var(--font-title)] text-xs font-bold"
                style={{ background: "rgba(232,93,42,.15)", border: "1px solid rgba(232,93,42,.4)", color: "var(--ember)" }}
              >
                {idx + 1}
              </div>
              <h3 className="m-0 mt-2 text-[13px] font-semibold text-white">{t(`howTo.${k}.title`)}</h3>
              <p className="mt-1 text-xs leading-snug text-zinc-400">{t(`howTo.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal mt-16 scroll-mt-24 rounded-[24px] border border-white/10 p-6 sm:p-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">Also available</p>
            <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">Chord Detector</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              Upload any song, get its key, BPM, and full chord progression back. 3 free, then pay per song — no
              mastering subscription required.
            </p>
          </div>
          <Link
            href="/chord-detector"
            className="shrink-0 rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            See how it works →
          </Link>
        </div>
      </section>

      <section className="reveal mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">By genre</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">Mastering tuned per genre</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {GENRE_KEYS.map((g) => (
            <Link
              key={g}
              href={`/master/${g}`}
              className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs text-zinc-300 hover:border-brass/50 hover:text-brass"
            >
              {GENRE_PAGES[g].label} mastering
            </Link>
          ))}
        </div>
      </section>

      <section id="faq" className="reveal mt-16 scroll-mt-24">
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("faq.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("faq.title")}</h2>
        <div className="mt-6 columns-1 gap-3 sm:columns-2 [&>*]:mb-3">
          {FAQ_KEYS.map((k) => (
            <FaqItem key={k} t={t} qKey={k} />
          ))}
        </div>
      </section>

      <section
        id="contact"
        className="reveal mt-16 scroll-mt-24 rounded-[28px] border border-white/10 p-8 sm:p-12"
        style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
      >
        <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("contact.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("contact.title")}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-300">{t("contact.body")}</p>
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
