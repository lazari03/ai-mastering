"use client";

import { useLanguage } from "@/lib/i18n";
import { IconMaster, IconChords, IconMyMasters } from "@/components/app/icons";

// A real map of what this app can actually do, not a marketing mockup —
// every card here deep-links into a tab/feature that exists today.
// Reference Mastering and Stem Separation aren't separate tabs; both are
// real toggles inside the Mastering console, so their cards route there
// too rather than pretending they're standalone tools.
function useExploreItems(goToTab) {
  const { t } = useLanguage();
  return [
    { key: "master", icon: IconMaster, title: t("app.explore.master.title"), body: t("app.explore.master.body"), onClick: () => goToTab("master") },
    { key: "reference", icon: IconMaster, title: t("app.explore.reference.title"), body: t("app.explore.reference.body"), onClick: () => goToTab("master") },
    { key: "stems", icon: IconMaster, title: t("app.explore.stems.title"), body: t("app.explore.stems.body"), onClick: () => goToTab("master") },
    { key: "chords", icon: IconChords, title: t("app.explore.chords.title"), body: t("app.explore.chords.body"), onClick: () => goToTab("chords") },
    { key: "myMasters", icon: IconMyMasters, title: t("app.explore.myMasters.title"), body: t("app.explore.myMasters.body"), onClick: () => goToTab("myMasters") },
  ];
}

export default function ExplorePanel({ onNavigate }) {
  const { t } = useLanguage();
  const items = useExploreItems(onNavigate);

  return (
    <div>
      <h1 className="m-0 text-2xl font-semibold text-text-primary sm:text-3xl">{t("app.explore.title")}</h1>
      <p className="mt-1.5 text-sm text-text-secondary">{t("app.explore.subtitle")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="group flex flex-col items-start rounded-2xl border border-border-subtle p-5 text-left transition hover:border-text-primary/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-text-primary">
                <Icon />
              </span>
              <h3 className="mt-4 text-base font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{item.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary group-hover:text-accent">
                {t(item.key === "myMasters" ? "app.tab.myMasters" : item.key === "chords" ? "app.tab.chords" : "app.tab.master")} <span aria-hidden="true">→</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
