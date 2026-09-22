"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import { useLanguage } from "@/lib/i18n";
import { CTA } from "@/lib/internalLinks";
import { trackEvent } from "@/lib/analytics";

function trackOpenAppClick() {
  trackEvent("cta_click", { cta_id: "open_app", location: "header" });
}

// Data-driven, same shape as AppClient.jsx's TABS array (key + a t()
// lookup key) — one array drives both the desktop nav and the mobile
// drawer below instead of two separate hardcoded lists.
const NAV_LINKS = [
  { href: "#features", key: "nav.features" },
  { href: "#pricing", key: "nav.pricing" },
  { href: "#how-to", key: "nav.howTo" },
  { href: "#faq", key: "nav.faq" },
  { href: "/blog", key: "nav.blog" },
  { href: "#contact", key: "nav.contact" },
];

/**
 * Extracted from HomeClient.jsx — pure relocation, not a restyle. Sticky
 * desktop nav + a real slide-in mobile drawer (fixed overlay + backdrop +
 * translate-x animation, same pattern /app's own sidebar drawer uses).
 * Self-sources useLanguage() rather than taking lang/t as props, matching
 * how BeforeAfterPlayer.jsx and other marketing components already do —
 * one less thing the page has to thread through.
 */
export default function SiteHeader() {
  const { lang, setLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef(null);

  // A 1px sentinel at the header's natural position tells us when the
  // page has scrolled at all. IntersectionObserver rather than a scroll
  // listener: a scroll handler fires every frame and forces layout
  // reads for what is a single boolean.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {/* A detached floating island, not a bar glued edge-to-edge to the
          top of the viewport: the nav is a self-contained pill with its
          own margin, radius and glass, so the page visibly continues
          behind and underneath it. backdrop-blur is safe here precisely
          because this element is sticky — it composites once instead of
          repainting a scrolling region. */}
      {/* z-50, deliberately ABOVE the menu overlay below (z-40): the
          hamburger morphs into the X that closes the menu, so the header
          has to stay on top of its own overlay or the only way out is
          the backdrop. See the z-index scale in globals.css. */}
      {/* Breaks out to full viewport width via margins rather than the
          usual `left-1/2 w-screen -translate-x-1/2` trick, deliberately:
          a transformed ancestor becomes the containing block for
          `position: fixed` descendants, which would quietly re-anchor
          the blur scrim below to this header instead of the viewport.
          The margin form has no such side effect.

          Needed because this header is shared by pages with different
          container widths — the homepage is 1280px, /blog is 820px — and
          without the breakout the pill inherits the narrow one and the
          nav links wrap onto two lines. */}
      <header className="sticky top-4 z-50 mx-[calc(50%-50vw)] mb-2 flex w-screen justify-center px-4 sm:top-6 sm:px-6">
        {/* Blurs whatever passes underneath the floating island —
            without it, body copy scrolls past in full focus in the gap
            above the pill and reads as a second, competing row.

            Lives INSIDE the header rather than as its own fixed layer
            with its own z-index: it then shares the header's stacking
            context and paints below the pill purely by DOM order, so
            the page needs one fewer z-index rung. Fades in only once
            scrolled, so the top of the hero is never behind a veil. The
            mask fades the blur out at the bottom instead of ending on a
            hard line — that line is the tell that gives these away.
            backdrop-filter is safe here because the element is fixed:
            it composites once instead of repainting on scroll. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-x-0 top-0 h-32 transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
          }}
        />
        {/* 92%, not 80%: the island spends the top of the homepage over
            a black hero, and at 80% enough of that black bleeds through
            to turn the cream pill a muddy grey. At 92% it stays crisp on
            black while still reading as glass over the cream sections
            it travels across further down. */}
        {/* 1232px is not arbitrary: it's the page's own content box —
            <main> is max-w-[1280px] with sm:px-6 gutters, so 1280 − 48.
            Matching it means the island's left and right edges line up
            exactly with the hero headline and the demo panel beneath.
            At the previous 1180px everything in the hero overhung the
            nav by 26px a side, which reads as the content escaping the
            header rather than as a deliberate offset. */}
        <div className="flex w-full max-w-[1232px] items-center justify-between gap-6 rounded-full border border-black/[0.07] bg-bg/[0.92] py-2.5 pl-5 pr-2.5 shadow-[0_1px_2px_rgba(36,32,26,0.04),0_12px_32px_-12px_rgba(36,32,26,0.16)] backdrop-blur-xl">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-text-primary">
            <LogoMark size={22} />
            <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-text-primary">
              Auralith <span className="font-normal text-text-secondary">Forge</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="rounded-full px-3 py-1.5 text-[13px] text-text-secondary transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.045] hover:text-text-primary"
              >
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitch lang={lang} setLang={setLang} />
            <Link href={CTA.signin} className="text-[13px] text-text-secondary transition hover:text-text-primary">
              {t("nav.signin")}
            </Link>
            {/* Button-in-button: the arrow lives in its own circular
                well flush with the pill's inner padding, and drifts
                diagonally on hover while the whole control presses in. */}
            <Link
              href={CTA.signup}
              onClick={trackOpenAppClick}
              className="group flex items-center gap-2.5 rounded-full bg-text-primary py-1.5 pl-5 pr-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
            >
              {t("nav.openApp")}
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-bg/15 text-[13px] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105"
              >
                ↗
              </span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={t("app.menu")}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.045] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 lg:hidden"
          >
            {/* Two lines that rotate into a true X around a shared
                centre, rather than a third line just winking out. */}
            <span
              className={`absolute h-px w-4 bg-text-primary transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuOpen ? "rotate-45" : "-translate-y-[3px]"
              }`}
            />
            <span
              className={`absolute h-px w-4 bg-text-primary transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                menuOpen ? "-rotate-45" : "translate-y-[3px]"
              }`}
            />
          </button>
        </div>
      </header>

      {/* Full-screen glass expansion rather than a side drawer, and
          rendered unconditionally (not `menuOpen ? ... : null`) so the
          closing choreography can actually play. Each link rides in from
          an invisible box on its own delay — the stagger is what makes
          the panel feel authored rather than toggled. */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-bg/80 backdrop-blur-2xl transition-opacity duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />

        <div className="relative flex h-full flex-col px-6 pb-10 pt-28">
          <nav className="flex flex-col">
            {NAV_LINKS.map((link, idx) => (
              <a
                key={link.key}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                style={{ transitionDelay: menuOpen ? `${120 + idx * 55}ms` : "0ms" }}
                className={`border-b border-black/[0.07] py-5 text-left font-[var(--font-title)] text-3xl font-medium tracking-tight text-text-primary transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  menuOpen ? "translate-y-0 opacity-100 blur-0" : "translate-y-10 opacity-0 blur-sm"
                }`}
              >
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="flex-1" />

          <div
            style={{ transitionDelay: menuOpen ? `${120 + NAV_LINKS.length * 55}ms` : "0ms" }}
            className={`transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              menuOpen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <Link href={CTA.signin} onClick={() => setMenuOpen(false)} className="text-sm text-text-secondary">
                {t("nav.signin")}
              </Link>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <Link
              href={CTA.signup}
              onClick={() => {
                trackOpenAppClick();
                setMenuOpen(false);
              }}
              className="group flex w-full items-center justify-between rounded-full bg-text-primary py-2 pl-6 pr-2 text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
            >
              {t("nav.openApp")}
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-bg/15 text-sm transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px"
              >
                ↗
              </span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
