"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import { useLanguage } from "@/lib/i18n";
import { CTA } from "@/lib/internalLinks";
import { loc, STUDIO_GROUPS } from "@/lib/studio";
import { trackEvent } from "@/lib/analytics";

function trackOpenAppClick() {
  trackEvent("cta_click", { cta_id: "open_app", location: "header" });
}

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

// Absolute paths ("/#pricing", not "#pricing") so the same header works on
// every route: on the homepage the browser treats them as in-page jumps,
// everywhere else they navigate home and scroll to the section. (Bare
// "#pricing" links used to do nothing at all outside the homepage.)
const NAV_LINKS = [
  { href: "/#pricing", key: "nav.pricing" },
  { href: "/blog", key: "nav.blog" },
  { href: "/#faq", key: "nav.faq" },
  { href: "/#contact", key: "nav.contact" },
];

/**
 * The site-wide header: a floating island with the Studio menu (every
 * real tool, grouped Master / Analyze / Prepare / Deliver — see
 * lib/studio.js), primary links, language, sign-in and Open App. Below
 * lg it collapses into a full-screen menu with the same content.
 */
export default function SiteHeader() {
  const { lang, setLang, t } = useLanguage();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef(null);
  const studioRef = useRef(null);
  const studioPanelId = useId();

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Any navigation closes both menus.
  useEffect(() => {
    setMenuOpen(false);
    setStudioOpen(false);
  }, [pathname]);

  // Studio panel: close on Escape or a click outside it.
  useEffect(() => {
    if (!studioOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setStudioOpen(false);
    const onClick = (e) => studioRef.current && !studioRef.current.contains(e.target) && setStudioOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [studioOpen]);

  // Full-screen menu: Escape closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const isActive = (href) => href !== "/" && !href.startsWith("/#") && pathname?.startsWith(href.split("?")[0]);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-text-primary focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Skip to content
      </a>
      {/* Floating island: sticky, breaks out to full viewport width via
          margins (not a transform, which would re-anchor the fixed scrim
          below to this element). z-50 stays above its own menu overlay
          (z-40) so the hamburger/X is always reachable. */}
      <header className="sticky top-4 z-50 mx-[calc(50%-50vw)] mb-2 flex w-screen justify-center px-4 sm:top-6 sm:px-6">
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-x-0 top-0 h-32 transition-opacity duration-500 ${EASE} ${scrolled ? "opacity-100" : "opacity-0"}`}
          style={{
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
          }}
        />
        <div
          ref={studioRef}
          className="relative flex w-full max-w-[1232px] items-center justify-between gap-6 rounded-full border border-black/[0.07] bg-bg/[0.92] py-2.5 pl-5 pr-2.5 shadow-[0_1px_2px_rgba(36,32,26,0.04),0_12px_32px_-12px_rgba(36,32,26,0.16)] backdrop-blur-xl"
        >
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-text-primary" aria-label="Auralith Forge — home">
            <LogoMark size={22} />
            <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-text-primary">
              Auralith <span className="font-normal text-text-secondary">Forge</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            <button
              type="button"
              aria-expanded={studioOpen}
              aria-controls={studioPanelId}
              onClick={() => setStudioOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-all duration-500 ${EASE} hover:bg-black/[0.045] hover:text-text-primary ${
                studioOpen ? "bg-black/[0.045] text-text-primary" : "text-text-secondary"
              }`}
            >
              {t("nav.studio")}
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={`transition-transform duration-300 ${studioOpen ? "rotate-180" : ""}`}>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {NAV_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-[13px] transition-all duration-500 ${EASE} hover:bg-black/[0.045] hover:text-text-primary ${
                  isActive(link.href) ? "text-text-primary" : "text-text-secondary"
                }`}
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
            <Link
              href={CTA.signup}
              onClick={trackOpenAppClick}
              className={`group flex items-center gap-2.5 rounded-full bg-text-primary py-1.5 pl-5 pr-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-all duration-500 ${EASE} active:scale-[0.98]`}
            >
              {t("nav.openApp")}
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-bg/15 text-[13px] transition-transform duration-500 ${EASE} group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105`}
              >
                ↗
              </span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t("app.closeMenu") : t("app.menu")}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.045] transition-transform duration-500 ${EASE} active:scale-95 lg:hidden`}
          >
            <span className={`absolute h-px w-4 bg-text-primary transition-transform duration-500 ${EASE} ${menuOpen ? "rotate-45" : "-translate-y-[3px]"}`} />
            <span className={`absolute h-px w-4 bg-text-primary transition-transform duration-500 ${EASE} ${menuOpen ? "-rotate-45" : "translate-y-[3px]"}`} />
          </button>

          {/* Studio panel (desktop only; the mobile menu lists the same tools). */}
          <div
            id={studioPanelId}
            className={`absolute left-0 right-0 top-[calc(100%+10px)] hidden overflow-hidden rounded-[28px] border border-black/[0.07] bg-bg shadow-[var(--shadow-ambient-lifted)] ${
              studioOpen ? "lg:block" : ""
            }`}
          >
            <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr] gap-px bg-border-subtle">
              {STUDIO_GROUPS.map((group) => (
                <div key={group.key} className="bg-bg p-6">
                  <p className="eyebrow m-0">{loc(group.label, lang)}</p>
                  <ul className={`m-0 mt-4 grid list-none gap-1 p-0 ${group.tools.length > 3 ? "grid-cols-2 gap-x-3" : ""}`}>
                    {group.tools.map((tool) => (
                      <li key={tool.key}>
                        <Link href={tool.href} onClick={() => setStudioOpen(false)} className="-mx-2 block rounded-xl px-2 py-2 transition hover:bg-black/[0.04]">
                          <span className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
                            {loc(tool.name, lang)}
                            {tool.appOnly ? (
                              <span className="rounded-full border border-border-subtle px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.1em] text-text-secondary">
                                {t("nav.appOnly")}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-text-secondary">{loc(tool.blurb, lang)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle px-6 py-3.5 text-[13px]">
              <span className="text-text-secondary">{t("nav.studioIntro")}</span>
              <Link href="/tools" onClick={() => setStudioOpen(false)} className="font-semibold text-text-primary hover:underline">
                {t("nav.allTools")} →
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen menu (below lg). Always rendered so the closing
          choreography plays; items ride in on staggered delays. */}
      <div className={`fixed inset-0 z-40 lg:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <div
          className={`absolute inset-0 bg-bg/90 backdrop-blur-2xl transition-opacity duration-700 ${EASE} ${menuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`relative flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28 transition-all duration-700 ${EASE} ${
            menuOpen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <nav aria-label="Studio" className="grid gap-7 sm:grid-cols-2">
            {STUDIO_GROUPS.map((group) => (
              <div key={group.key}>
                <p className="eyebrow m-0">{loc(group.label, lang)}</p>
                <ul className="m-0 mt-2 list-none p-0">
                  {group.tools.map((tool) => (
                    <li key={tool.key}>
                      <Link
                        href={tool.href}
                        tabIndex={menuOpen ? 0 : -1}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 border-b border-black/[0.06] py-3 font-[var(--font-title)] text-xl font-medium tracking-tight text-text-primary"
                      >
                        {loc(tool.name, lang)}
                        {tool.appOnly ? (
                          <span className="rounded-full border border-border-subtle px-1.5 py-px font-[var(--font-body)] text-[9px] font-medium uppercase tracking-[0.1em] text-text-secondary">
                            {t("nav.appOnly")}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <nav aria-label="Primary" className="mt-8 flex flex-wrap gap-2">
            <Link href="/tools" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} className="btn-secondary btn-sm">
              {t("nav.allTools")}
            </Link>
            {NAV_LINKS.map((link) => (
              <a key={link.key} href={link.href} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} className="btn-secondary btn-sm">
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between gap-2">
              <Link href={CTA.signin} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} className="text-sm text-text-secondary">
                {t("nav.signin")}
              </Link>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <Link
              href={CTA.signup}
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => {
                trackOpenAppClick();
                setMenuOpen(false);
              }}
              className={`group flex w-full items-center justify-between rounded-full bg-text-primary py-2 pl-6 pr-2 text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-transform duration-500 ${EASE} active:scale-[0.98]`}
            >
              {t("nav.openApp")}
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-bg/15 text-sm">
                ↗
              </span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
