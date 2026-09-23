"use client";

import Link from "next/link";

import LogoMark from "@/components/brand/LogoMark";
import { useLanguage } from "@/lib/i18n";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";

export default function NewsletterPageClient() {
  const { t } = useLanguage();

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 text-text-primary">
        <LogoMark size={20} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
          Auralith <span className="font-normal text-text-secondary">Forge</span>
        </span>
      </Link>
      <div className="bezel mt-10 w-full max-w-[460px]">
        <div className="bezel-core p-6 text-left sm:p-8">
          <p className="eyebrow m-0">Newsletter</p>
          <h1 className="mt-4 font-[var(--font-title)] text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary sm:text-[36px]">
            {t("newsletterPage.title")}
          </h1>
          <p className="mt-3 text-[15px] leading-[1.65] text-text-secondary">{t("newsletterPage.body")}</p>
          <div className="mt-6">
            <NewsletterWidget source="newsletter-page" size="lg" />
          </div>
        </div>
      </div>
      <Link href="/" className="mt-6 text-[13px] text-text-secondary transition hover:text-text-primary">
        {t("newsletterPage.back")}
      </Link>
    </main>
  );
}
