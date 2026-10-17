"use client";

import StatePanel from "@/components/site/StatePanel";
import { LinkList } from "@/components/site/Page";
import { useLanguage } from "@/lib/i18n";
import { NOT_FOUND_LINKS } from "@/lib/navigation";

// Localized body of app/not-found.js (a server component can't read the
// language context). Links come from lib/navigation.js.
export default function NotFoundContent() {
  const { t } = useLanguage();
  const label = (item) => ({ href: item.href, label: t(item.labelKey) });
  return (
    <>
      <StatePanel
        eyebrow={t("notFound.eyebrow")}
        title={t("notFound.title")}
        body={t("notFound.body")}
        headingLevel={1}
        actions={NOT_FOUND_LINKS.actions.map(label)}
      />
      <div className="mx-auto mt-4 grid max-w-[720px] gap-10 border-t border-border-subtle pt-10 sm:grid-cols-2">
        <LinkList title={t("notFound.popularTools")} links={NOT_FOUND_LINKS.tools.map(label)} />
        <LinkList title={t("notFound.read")} links={NOT_FOUND_LINKS.read.map(label)} />
      </div>
    </>
  );
}
