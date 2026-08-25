"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/i18n";
import ThankYouTracker from "./ThankYouTracker";

export default function ThankYouPageClient({ plan, item, price }) {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-6 text-center text-white">
      <ThankYouTracker plan={plan} item={item} price={price} />
      <p className="m-0 text-3xl">✓</p>
      <h1 className="m-0 font-[var(--font-title)] text-3xl">{t("thankYou.title")}</h1>
      <p className="m-0 max-w-sm text-sm text-zinc-400">{t("thankYou.body")}</p>
      <Link
        href="/app"
        className="mt-2 rounded-full bg-ember px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#100b08] hover:brightness-110"
      >
        {t("thankYou.backToApp")}
      </Link>
    </main>
  );
}
