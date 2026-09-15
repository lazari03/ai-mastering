"use client";

import { useState } from "react";
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

  return (
    <>
      <header className="sticky top-0 z-40 -mx-4 mb-2 border-b border-white/10 bg-[#0b0d10]/80 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-[var(--font-title)] text-[13px] uppercase tracking-[0.22em] text-brass">
              Auralith Forge
            </span>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.key} href={link.href} className="text-[13px] text-zinc-300 hover:text-white">
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitch lang={lang} setLang={setLang} />
            <Link href={CTA.signin} className="text-[13px] text-zinc-300 hover:text-white">
              {t("nav.signin")}
            </Link>
            <Link
              href={CTA.signup}
              onClick={trackOpenAppClick}
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

      {/* Mobile menu — rendered unconditionally (not `menuOpen ? ... :
          null`) so the closing animation can actually play. */}
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
            {NAV_LINKS.map((link) => (
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
              <Link href={CTA.signin} onClick={() => setMenuOpen(false)} className="text-xs text-zinc-400">
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
              className="block w-full rounded-full border border-brass/50 bg-brass/[0.15] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-brass"
            >
              {t("nav.openApp")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
