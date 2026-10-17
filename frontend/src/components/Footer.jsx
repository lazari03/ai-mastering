"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import LogoMark from "@/components/brand/LogoMark";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";
import { useLanguage } from "@/lib/i18n";
import { COMPARE_NAV, GENRE_NAV, HOME, isActiveHref, LEGAL_NAV, PRODUCT_NAV, PUBLIC_TOOLS, RESOURCES_GUIDES_NAV, RESOURCES_MISC_NAV } from "@/lib/navigation";
import { loc } from "@/lib/studio";

// Site-wide footer. Every column renders from lib/navigation.js (tools from
// lib/studio.js via it), so the footer can't list a page or tool that doesn't
// exist and can't drift from the header.

function Column({ title, children }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-primary">{title}</p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }) {
  const pathname = usePathname();
  const active = isActiveHref(pathname, href);
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={`text-[13px] transition hover:text-text-primary ${active ? "text-text-primary" : "text-text-secondary"}`}>
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
            <Link href={HOME} className="flex items-center gap-2.5 text-text-primary">
              <LogoMark size={20} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
                Auralith <span className="font-normal text-text-secondary">Forge</span>
              </span>
            </Link>
            <p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-text-secondary">{t("footer.tagline")}</p>
          </div>

          <Column title={t("footer.col.product")}>
            {PRODUCT_NAV.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {t(item.labelKey)}
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.analyze")}>
            {PUBLIC_TOOLS.map((tool) => (
              <FooterLink key={tool.key} href={tool.href}>
                {loc(tool.name, lang)}
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.genres")}>
            {GENRE_NAV.map((g) => (
              <FooterLink key={g.key} href={g.href}>
                {t("footer.link.genreMastering", { genre: g.label })}
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.resources")}>
            {RESOURCES_GUIDES_NAV.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {t(item.labelKey)}
              </FooterLink>
            ))}
            {COMPARE_NAV.map((c) => (
              <FooterLink key={c.key} href={c.href}>
                {t("footer.link.vsCompetitor", { name: c.label })}
              </FooterLink>
            ))}
            {RESOURCES_MISC_NAV.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {t(item.labelKey)}
              </FooterLink>
            ))}
          </Column>

          <Column title={t("footer.col.legal")}>
            {LEGAL_NAV.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {t(item.labelKey)}
              </FooterLink>
            ))}
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
