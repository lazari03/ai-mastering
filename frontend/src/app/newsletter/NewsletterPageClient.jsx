"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/i18n";
import NewsletterWidget from "@/components/marketing/NewsletterWidget";

export default function NewsletterPageClient() {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0b0d10] px-6 py-16 text-center text-white">
      <Link href="/" className="text-[11px] uppercase tracking-[0.16em] text-brass">
        Auralith Forge
      </Link>
      <h1 className="m-0 max-w-md font-[var(--font-title)] text-3xl sm:text-4xl">{t("newsletterPage.title")}</h1>
      <p className="m-0 max-w-sm text-sm text-zinc-400">{t("newsletterPage.body")}</p>
      <div className="w-full max-w-sm text-left">
        <NewsletterWidget source="newsletter-page" size="lg" />
      </div>
      <Link href="/" className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
        {t("newsletterPage.back")}
      </Link>
    </main>
  );
}
