"use client";

import Link from "next/link";

import LogoMark from "@/components/brand/LogoMark";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";
import { GENRE_KEYS, GENRE_PAGES } from "@/content/genrePages";
import { useLanguage } from "@/lib/i18n";
import { loc, STUDIO_GROUPS } from "@/lib/studio";

// Site-wide footer. Every link that was here before is still here (the
// public tools, AI Mastering Online, loudness targets, both comparisons,
// guides, terms/privacy/refund) — plus the SEO pages the old footer never
// linked: LUFS Meter, the /tools hub and all eight /master/<genre> pages.
// Tool lists come from lib/studio.js so the footer can't list a tool the
// product doesn't have.
const PUBLIC_ANALYZE = STUDIO_GROUPS.find((g) => g.key === "analyze").tools;

function Column({ title, children }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-primary">{title}</p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }) {
  return (
    <li>
      <Link href={href} className="text-[13px] text-text-secondary transition hover:text-text-primary">
        {children}
      </Link>
    </li>
  );
}

export default function Footer() {
  const { lang, t } = useLanguage();

  return (
    <footer className="mt-24 border-t border-border-subtle">
      <div className="mx-auto w-full max-w-[1232px] px-4 sm:px-6">
        <div className="flex flex-col gap-6 border-b border-border-subtle py-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-[360px]">
            <p className="m-0 text-[15px] font-semibold text-text-primary">{t("footer.newsletter.title")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{t("footer.newsletter.body")}</p>
          </div>
          <div className="w-full md:w-[380px] md:shrink-0">
            <NewsletterWidget source="footer" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] [&>*]:min-w-0">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 text-text-primary">
              <LogoMark size={20} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
                Auralith <span className="font-normal text-text-secondary">Forge</span>
              </span>
            </Link>
            <p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-text-secondary">{t("footer.tagline")}</p>
          </div>

          <Column title={t("footer.col.product")}>
            <FooterLink href="/ai-mastering-online">{t("footer.link.aiMasteringOnline")}</FooterLink>
            <FooterLink href="/tools">{t("footer.link.allTools")}</FooterLink>
            <FooterLink href="/pricing">{t("footer.link.pricing")}</FooterLink>
            <FooterLink href="/login?mode=signup">{t("footer.link.openApp")}</FooterLink>
          </Column>

          <Column title={t("footer.col.analyze")}>
            {PUBLIC_ANALYZE.map((tool) => (
              <FooterLink key={tool.key} href={tool.href}>
                {loc(tool.name, lang)}
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.genres")}>
            {GENRE_KEYS.map((g) => (
              <FooterLink key={g} href={`/master/${g}`}>
                {GENRE_PAGES[g].label} mastering
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.resources")}>
            <FooterLink href="/blog">{t("nav.blog")}</FooterLink>
            <FooterLink href="/mastering-loudness-targets">{t("footer.link.loudnessTargets")}</FooterLink>
            <FooterLink href="/vs/landr">Auralith {t("footer.link.vsLandr")}</FooterLink>
            <FooterLink href="/vs/emastered">Auralith {t("footer.link.vsEmastered")}</FooterLink>
            <FooterLink href="/#faq">{t("footer.link.faq")}</FooterLink>
          </Column>

          <Column title={t("footer.col.legal")}>
            <FooterLink href="/terms">{t("footer.legal.terms")}</FooterLink>
            <FooterLink href="/privacy">{t("footer.legal.privacy")}</FooterLink>
            <FooterLink href="/refund">{t("footer.legal.refund")}</FooterLink>
            <FooterLink href="/#contact">{t("footer.link.contact")}</FooterLink>
          </Column>
        </div>

        <div className="flex flex-col gap-2 border-t border-border-subtle py-6 text-[12px] text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">
            © {new Date().getFullYear()} Auralith Forge. {t("footer.rights")}
          </p>
          <p className="m-0">{t("nav.studioIntro")}</p>
        </div>
      </div>
    </footer>
  );
}
