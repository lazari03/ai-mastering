"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/i18n";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";

// Paths are literals here, not imports from lib/internalLinks — this is a
// "use client" component, and internalLinks pulls in content/posts.js and
// content/genrePages.js to build its link graph. Importing it would drag
// every article's full body text and all eight genres' copy into the
// client bundle of every page that renders a footer, which is all of
// them, to save retyping four strings.

// Site-wide footer — one component instead of duplicated per page, used
// by every public/marketing page (homepage, genre pages, comparison
// pages, tool-finder pages, blog, legal pages). Deliberately NOT used on
// /app (the authenticated dashboard) or /login (a minimal auth form) —
// those are product screens, not marketing surfaces, and a footer full of
// "Compare / vs LANDR / Free Tools" links would be clutter there, not
// signal.
//
// Manages its own width/padding (max-w-[1200px], matching the homepage's
// original container) rather than inheriting whatever <main> it's dropped
// after — the pages that use this render narrower content columns
// (max-w-[760px]-[900px] for readable line length), and a footer with nav
// columns reads fine wider than that, same as most sites' footer bands.
// Render it as a sibling right after a page's closing </main>, not nested
// inside it.
export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="mx-auto mt-16 flex w-full max-w-[1200px] flex-col gap-8 border-t border-white/10 px-4 pb-10 pt-8 sm:px-6">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="sm:max-w-[320px]">
          <p className="m-0 text-sm font-semibold text-white">{t("footer.newsletter.title")}</p>
          <p className="mt-1 text-xs text-zinc-400">{t("footer.newsletter.body")}</p>
        </div>
        <div className="mt-3 sm:mt-0 sm:w-[360px] sm:shrink-0">
          <NewsletterWidget source="footer" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <p className="m-0 text-xs uppercase tracking-[0.22em] text-brass">Auralith Forge</p>
          <p className="mt-1 text-xs text-zinc-400">{t("footer.tagline")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("footer.col.freeTools")}</p>
          <Link href="/chord-detector" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.chordDetector")}</Link>
          <Link href="/song-key-finder" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.songKeyFinder")}</Link>
          <Link href="/bpm-finder" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.bpmFinder")}</Link>
          <Link href="/chord-progression-finder" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.chordProgressionFinder")}</Link>
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("footer.col.compare")}</p>
          <Link href="/ai-mastering-online" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.aiMasteringOnline")}</Link>
          <Link href="/vs/landr" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.vsLandr")}</Link>
          <Link href="/vs/emastered" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.link.vsEmastered")}</Link>
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("footer.col.company")}</p>
          <Link href="/blog" className="text-xs text-zinc-400 hover:text-zinc-200">{t("nav.blog")}</Link>
          <Link href="/terms" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.legal.terms")}</Link>
          <Link href="/privacy" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.legal.privacy")}</Link>
          <Link href="/refund" className="text-xs text-zinc-400 hover:text-zinc-200">{t("footer.legal.refund")}</Link>
        </div>
      </div>
      <p className="text-xs text-zinc-500">© {new Date().getFullYear()} Auralith Forge. {t("footer.rights")}</p>
    </footer>
  );
}
