"use client";

import { useEffect } from "react";

import StatePanel from "@/components/site/StatePanel";
import { useLanguage } from "@/lib/i18n";
import { APP } from "@/lib/navigation";

// Route-level error boundary: a server/render failure on any page lands
// here instead of a blank screen, with a retry and a way out.
export default function RouteError({ error, reset }) {
  const { t } = useLanguage();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-[1080px] px-4 py-16 sm:px-6">
      <StatePanel
        tone="error"
        eyebrow={t("routeError.eyebrow")}
        title={t("routeError.title")}
        body={t("routeError.body")}
        headingLevel={1}
        actions={[
          { label: t("routeError.retry"), onClick: () => reset() },
          { href: APP, label: t("routeError.openApp") },
        ]}
      />
      {error?.digest ? <p className="text-center font-mono text-[11px] text-text-secondary">{t("routeError.reference", { digest: error.digest })}</p> : null}
    </main>
  );
}
