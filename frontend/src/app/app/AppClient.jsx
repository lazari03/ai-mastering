"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import CleanAudioPanel from "@/app/ui/CleanAudioPanel";
import ChordsPanel from "@/app/ui/ChordsPanel";
import MasteringConsole from "@/app/ui/MasteringConsole";
import MyMastersPanel from "@/app/ui/MyMastersPanel";
import HelpSupportPanel from "@/app/ui/HelpSupportPanel";
import SettingsPanel from "@/app/ui/SettingsPanel";
import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import NotificationBanner from "@/components/app/NotificationBanner";
import EntitlementsBadge from "@/components/app/EntitlementsBadge";
import { IconClean, IconMaster, IconChords, IconMyMasters, IconHelp, IconSettings, IconChevronLeft, IconChevronRight } from "@/components/app/icons";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { useLanguage } from "@/lib/i18n";

const TABS = [
  { key: "clean", labelKey: "app.tab.clean", icon: IconClean, render: () => <CleanAudioPanel /> },
  { key: "master", labelKey: "app.tab.master", icon: IconMaster, render: () => <MasteringConsole /> },
  { key: "chords", labelKey: "app.tab.chords", icon: IconChords, render: () => <ChordsPanel /> },
  { key: "myMasters", labelKey: "app.tab.myMasters", icon: IconMyMasters, render: () => <MyMastersPanel /> },
  { key: "help", labelKey: "app.tab.help", icon: IconHelp, render: () => <HelpSupportPanel /> },
  { key: "settings", labelKey: "app.tab.settings", icon: IconSettings, render: () => <SettingsPanel /> },
];

const SIDEBAR_PREF_KEY = "sidebarOpen";

export default function AppClient() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const { user, loading, signOut } = useAuthStore();
  const [activeTab, setActiveTab] = useState("master");
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop sidebar on/off — separate from menuOpen (that's the mobile
  // dropdown). Persisted so the choice sticks across reloads.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    if (stored !== null) setSidebarOpen(stored === "true");
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_PREF_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Fetched once here (not per-component) — every entitlement-gated button
  // and the badge below all read this same cached value instead of each
  // fetching its own copy, which is what used to let one button show
  // "unlocked" while another still thought the user was on Free. Refreshed
  // again below whenever something could plausibly have changed it.
  const fetchEntitlements = useEntitlementsStore((s) => s.fetch);
  const refreshEntitlements = useEntitlementsStore((s) => s.refresh);
  useEffect(() => {
    if (user) fetchEntitlements();
  }, [user, fetchEntitlements]);

  // Covers returning from a Polar checkout: the user lands back on /app
  // (any tab) and this re-checks entitlements immediately rather than
  // trusting a value fetched before they paid. Also covers the mundane
  // case of just switching tabs after a while — cheap enough to not matter.
  useEffect(() => {
    if (user) refreshEntitlements();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hitting "Master Track" (a real render, not the free 30s preview) jumps
  // straight to My Masters once it lands — that's where Download/Share/
  // Delete live, so there's no reason to make the user go find it
  // themselves. Previews stay on the Master tab (the aside there is
  // already the right place to A/B a preview against the original).
  // Also refreshes entitlements — a real master just spent one quota slot.
  const masteringResult = useMasteringStore((s) => s.result);
  const lastAutoNavJobId = useRef(null);
  useEffect(() => {
    if (!masteringResult?.job_id || masteringResult.preview) return;
    if (masteringResult.job_id === lastAutoNavJobId.current) return;
    lastAutoNavJobId.current = masteringResult.job_id;
    refreshEntitlements();
    setActiveTab("myMasters");
  }, [masteringResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // While Firebase's async session check is still running, or once it's
  // resolved to "not signed in" and the redirect above is about to fire —
  // render nothing rather than flashing the real app content first.
  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  const active = TABS.find((tab) => tab.key === activeTab) || TABS[0];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile top bar — the sidebar below is hidden on small screens */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 p-3.5 md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="font-[var(--font-title)] text-xs uppercase tracking-[0.18em] text-brass">
            Auralith Forge
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/20"
        >
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`} />
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`} />
        </button>
      </div>
      {menuOpen ? (
        <div className="flex flex-col gap-1 border-b border-white/10 bg-black/30 p-3.5 md:hidden">
          <nav className="flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setMenuOpen(false);
                  }}
                  aria-pressed={isActive}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition ${
                    isActive ? "bg-ember/[0.12] text-ember" : "text-zinc-300"
                  }`}
                >
                  <Icon />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <p className="min-w-0 flex-1 break-all text-xs text-zinc-500">{user.email}</p>
            <LanguageSwitch lang={lang} setLang={setLang} />
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 w-full rounded-lg border border-white/[0.12] bg-black/20 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] text-zinc-300"
          >
            {t("app.signout")}
          </button>
        </div>
      ) : null}

      {/* Desktop sidebar — toggleable on/off (persisted), hidden outright on mobile.
          Collapsed state stays as a slim icon-only rail rather than vanishing
          entirely, so switching tabs never requires reopening it first. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-white/10 bg-black/20 transition-[width] duration-150 md:flex ${
          sidebarOpen ? "w-[204px] p-3" : "w-[60px] items-center p-2"
        }`}
      >
        <div className={`flex items-center pb-5 pt-1.5 ${sidebarOpen ? "justify-between px-1.5" : "flex-col gap-3"}`}>
          <Link href="/" className="flex items-center gap-2" title="Auralith Forge">
            <LogoMark size={20} />
            {sidebarOpen ? (
              <span className="font-[var(--font-title)] text-[11px] uppercase tracking-[0.16em] text-brass">
                Auralith Forge
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Collapse menu" : "Expand menu"}
            title={sidebarOpen ? "Collapse menu" : "Expand menu"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
          >
            {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
          </button>
        </div>

        <nav className={`flex flex-col gap-0.5 ${sidebarOpen ? "" : "items-center"}`}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={isActive}
                title={sidebarOpen ? undefined : t(tab.labelKey)}
                className={`flex items-center rounded-lg text-[12.5px] font-semibold transition ${
                  sidebarOpen ? "gap-2.5 px-2.5 py-2" : "h-9 w-9 justify-center"
                } ${isActive ? "bg-ember/[0.14] text-ember" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}
              >
                <Icon />
                {sidebarOpen ? <span className="truncate">{t(tab.labelKey)}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {sidebarOpen ? (
          <div className="border-t border-white/10 px-0.5 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-500" title={user.email}>
                {user.email}
              </p>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg border border-white/[0.1] bg-black/20 px-2.5 py-2 text-[10.5px] uppercase tracking-[0.1em] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
            >
              {t("app.signout")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={signOut}
            aria-label={t("app.signout")}
            title={t("app.signout")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border-t border-white/10 text-zinc-500 hover:text-zinc-200"
          >
            ⏻
          </button>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">{active.render()}</main>

      <NotificationBanner activeTab={activeTab} onView={() => setActiveTab("master")} />
      <EntitlementsBadge onClick={() => setActiveTab("settings")} />
    </div>
  );
}
