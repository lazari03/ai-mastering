"use client";

import LogoMark from "@/components/brand/LogoMark";
import StatePanel from "@/components/site/StatePanel";
import { useLanguage } from "@/lib/i18n";
import ThankYouTracker from "./ThankYouTracker";

export default function ThankYouPageClient({ plan, item, price }) {
  const { t } = useLanguage();

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
      <ThankYouTracker plan={plan} item={item} price={price} />
      <span className="flex items-center gap-2.5 text-text-primary">
        <LogoMark size={20} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
          Auralith <span className="font-normal text-text-secondary">Forge</span>
        </span>
      </span>
      <div className="bezel mt-8 w-full max-w-[520px]">
        <div className="bezel-core px-6">
          <StatePanel
            tone="success"
            title={t("thankYou.title")}
            body={t("thankYou.body")}
            headingLevel={1}
            compact
            actions={[{ href: "/app", label: t("thankYou.backToApp") }]}
          />
        </div>
      </div>
    </main>
  );
}
