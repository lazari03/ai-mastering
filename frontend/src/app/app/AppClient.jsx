"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import ChordsPanel from "@/app/ui/ChordsPanel";
import MasteringConsole from "@/app/ui/MasteringConsole";
import MasterResultView from "@/app/ui/MasterResultView";
import MyMastersPanel from "@/app/ui/MyMastersPanel";
import HelpSupportPanel from "@/app/ui/HelpSupportPanel";
import SettingsPanel from "@/app/ui/SettingsPanel";
import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import NotificationBanner from "@/components/app/NotificationBanner";
import EntitlementsBadge from "@/components/app/EntitlementsBadge";
import OnboardingTour from "@/components/app/OnboardingTour";
import MasteringLoaderOverlay from "@/components/app/MasteringLoaderOverlay";
import { LoadingBlock } from "@/components/ui/Spinner";
import { IconMaster, IconChords, IconMyMasters, IconHelp, IconSettings, IconChevronLeft, IconChevronRight } from "@/components/app/icons";
import { getProfile, postProfile } from "@/network/http/client";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { useMasteringProgress } from "@/lib/useMasteringProgress";
import { useLanguage } from "@/lib/i18n";

const TABS = [
  {
    key: "master",
    labelKey: "app.tab.master",
    icon: IconMaster,
    render: (ctx) => <MasteringConsole onOpenHelp={() => ctx.setActiveTab("help")} onOpenBilling={() => ctx.setActiveTab("settings")} />,
  },
  {
    key: "chords",
    labelKey: "app.tab.chords",
    icon: IconChords,
    render: (ctx) => <ChordsPanel onOpenBilling={() => ctx.setActiveTab("settings")} onMasterThisSong={() => ctx.setActiveTab("master")} />,
  },
  { key: "myMasters", labelKey: "app.tab.myMasters", icon: IconMyMasters, render: () => <MyMastersPanel /> },
  { key: "help", labelKey: "app.tab.help", icon: IconHelp, render: () => <HelpSupportPanel /> },
  { key: "settings", labelKey: "app.tab.settings", icon: IconSettings, render: (ctx) => <SettingsPanel onReplayTutorial={() => ctx.setShowTutorial(true)} /> },
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

  // First-time-only onboarding tour — gated by profile.tutorialShown
  // (Firestore, survives reloads/devices, unlike a localStorage flag).
  // Checked once per sign-in; never re-shown once set.
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (!cancelled && !profile.tutorialShown) setShowTutorial(true);
      })
      .catch(() => {}); // non-critical — worst case the tour just doesn't show this load
    return () => {
      cancelled = true;
    };
  }, [user]);

  const dismissTutorial = () => {
    setShowTutorial(false);
    postProfile({ tutorialShown: true }).catch(() => {}); // best-effort; UI already moved on
  };

  // Covers returning from a Polar checkout: the user lands back on /app
  // (any tab) and this re-checks entitlements immediately rather than
  // trusting a value fetched before they paid. Also covers the mundane
  // case of just switching tabs after a while — cheap enough to not matter.
  useEffect(() => {
    if (user) refreshEntitlements();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hitting "Master Track" (a real render, not the free 30s preview) jumps
  // to a dedicated result page once it lands, instead of My Masters — the
  // finished master gets its own reveal (WebGL preview, before/after,
  // download) rather than dropping the user into the list view. My
  // Masters is still one click away from there. Previews stay on the
  // Master tab (the aside there is already the right place to A/B a
  // preview against the original). Also refreshes entitlements — a real
  // master just spent one quota slot.
  const masteringResult = useMasteringStore((s) => s.result);
  const lastAutoNavJobId = useRef(null);
  useEffect(() => {
    if (!masteringResult?.job_id || masteringResult.preview) return;
    if (masteringResult.job_id === lastAutoNavJobId.current) return;
    lastAutoNavJobId.current = masteringResult.job_id;
    refreshEntitlements();
    setActiveTab("result");
  }, [masteringResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen render-status overlay — one shared timeline (see the hook's
  // own comment) drives it regardless of which tab is active underneath,
  // so it still shows even if the user switches tabs mid-render.
  const { progress: masteringProgress, phaseMessage: masteringPhaseMessage } = useMasteringProgress();
  const isMasteringSubmitting = useMasteringStore((s) => s.isSubmitting);

  // While Firebase's async session check is still running, or once it's
  // resolved to "not signed in" and the redirect above is about to fire —
  // render nothing rather than flashing the real app content first.
  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <LoadingBlock />
      </main>
    );
  }

  // "result" is a transient destination (reached only via the auto-nav
  // effect above, or its own nav buttons), not a persistent sidebar tab —
  // deliberately absent from TABS so it never appears in the nav lists
  // below. Falls back to the Master tab if reached with nothing to show
  // (e.g. the result was cleared by "Master Another Track").
  const showResultView = activeTab === "result" && Boolean(masteringResult) && !masteringResult.preview;
  const active = TABS.find((tab) => tab.key === activeTab) || TABS[0];

  return (
    // h-screen + overflow-hidden, not min-h-screen — pins the whole shell to
    // exactly the viewport height so the sidebar/top bar never scroll away
    // with the page. The inline style height:100dvh is deliberate on top of
    // h-screen (100vh), not a replacement for it: mobile Safari's 100vh is
    // calculated against the LARGEST possible viewport (toolbar hidden),
    // which is taller than what's actually visible on load — combined with
    // overflow-hidden here, that used to mean the shell was pinned to a
    // height taller than the real visible area. 100dvh tracks the real
    // visible viewport and updates live as the toolbar shows/hides;
    // browsers that don't understand the dvh unit treat the whole
    // declaration as invalid and fall back to the h-screen class's 100vh,
    // so this is additive, never a regression on older browsers. Only
    // <main> below scrolls (overflow-y-auto), and the sidebar gets its own
    // overflow-y-auto as a safety valve for short windows with many tabs,
    // not as its normal behavior.
    <div className="flex h-screen flex-col overflow-hidden md:flex-row" style={{ height: "100dvh" }}>
      {/* Mobile top bar — the sidebar below is hidden on small screens */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/20 p-3.5 md:hidden">
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
          aria-label={t("app.menu")}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/20"
        >
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`} />
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`h-px w-4 bg-zinc-200 transition ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile menu — a real slide-in drawer (fixed overlay + backdrop +
          translate-x animation), not an inline dropdown that pushes page
          content down. Rendered unconditionally (not `menuOpen ? ... :
          null`) so the closing animation can actually play instead of the
          panel just vanishing; pointer-events and opacity handle whether
          it's interactive/visible while the transform handles the slide. */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col border-l border-white/10 bg-[#14110f] p-5 shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between pb-6">
            <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
              <LogoMark size={22} />
              <span className="font-[var(--font-title)] text-xs uppercase tracking-[0.18em] text-brass">
                Auralith Forge
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("app.closeMenu")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-lg text-zinc-300"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col gap-1">
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
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${
                    isActive ? "bg-ember/[0.14] text-ember" : "text-zinc-300 active:bg-white/5"
                  }`}
                >
                  <Icon />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="border-t border-white/10 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 break-all text-xs text-zinc-500">{user.email}</p>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg border border-white/[0.12] bg-black/20 px-3 py-3 text-[11px] uppercase tracking-[0.1em] text-zinc-300 active:bg-white/5"
            >
              {t("app.signout")}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar — toggleable on/off (persisted), hidden outright on mobile.
          Collapsed state stays as a slim icon-only rail rather than vanishing
          entirely, so switching tabs never requires reopening it first. */}
      <aside
        className={`hidden shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/20 transition-[width] duration-150 md:flex ${
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
            aria-label={sidebarOpen ? t("app.collapseMenu") : t("app.expandMenu")}
            title={sidebarOpen ? t("app.collapseMenu") : t("app.expandMenu")}
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

      {/* min-h-0 is not decorative — without it, a flex column child (the
          mobile layout, since the shell is flex-col below md:) defaults to
          min-height:auto, which blocks overflow-y-auto from ever actually
          engaging: <main> just grows past the viewport instead of
          scrolling, and the shell's overflow-hidden then silently clips
          whatever doesn't fit (this is exactly what made Settings' Danger
          Zone section unreachable on mobile — it was rendered, just
          clipped below the visible screen with no way to scroll to it).
          min-w-0 is the equivalent fix for the desktop flex-row case. */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {showResultView ? (
          <MasterResultView onMasterAnother={() => setActiveTab("master")} onViewAllMasters={() => setActiveTab("myMasters")} />
        ) : (
          active.render({ setActiveTab, setShowTutorial })
        )}
      </main>

      <NotificationBanner activeTab={activeTab} onView={() => setActiveTab("master")} />
      <EntitlementsBadge onClick={() => setActiveTab("settings")} />
      {showTutorial ? <OnboardingTour onDone={dismissTutorial} /> : null}
      <MasteringLoaderOverlay visible={isMasteringSubmitting} progress={masteringProgress} phaseMessage={masteringPhaseMessage} />
    </div>
  );
}
