"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import ChordsPanel from "@/app/ui/ChordsPanel";
import MasteringConsole from "@/app/ui/MasteringConsole";
import MasterResultView from "@/app/ui/MasterResultView";
import MyMastersPanel from "@/app/ui/MyMastersPanel";
import ExplorePanel from "@/app/ui/ExplorePanel";
import HomePanel from "@/app/ui/HomePanel";
import HelpSupportPanel from "@/app/ui/HelpSupportPanel";
import SettingsPanel from "@/app/ui/SettingsPanel";
import PlansPanel from "@/app/ui/PlansPanel";
import LogoMark from "@/components/brand/LogoMark";
import LanguageSwitch from "@/components/brand/LanguageSwitch";
import NotificationBanner from "@/components/app/NotificationBanner";
import VerifyEmailBanner from "@/components/app/VerifyEmailBanner";
import AppSearch from "@/components/app/AppSearch";
import AppNotificationsBell from "@/components/app/AppNotificationsBell";
import EntitlementsBadge from "@/components/app/EntitlementsBadge";
import OnboardingTour from "@/components/app/OnboardingTour";
import MasteringLoaderOverlay from "@/components/app/MasteringLoaderOverlay";
import { LoadingBlock } from "@/components/ui/Spinner";
import { IconHome, IconMaster, IconChords, IconMyMasters, IconExplore, IconHelp, IconSettings, IconBilling, IconChevronLeft, IconChevronRight } from "@/components/app/icons";
import { getProfile, postProfile } from "@/network/http/client";
import { useAuthStore } from "@/store/authStore";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { useMasteringProgress } from "@/lib/useMasteringProgress";
import { useLanguage } from "@/lib/i18n";

// `group` sorts a tab under a small-caps section header in the sidebar
// (CREATE / ANALYZE / LIBRARY, matching the reference dashboard's IA) —
// tabs with no group (plans/help/settings) render in the fixed bottom
// section instead, same as the reference's Settings/Help rows below the
// main nav. This only reorganizes the 6 tabs that already exist; it
// doesn't add tools (Reference Master, Stem Separation, etc.) that aren't
// real features yet.
const TABS = [
  { key: "home", labelKey: "app.tab.home", icon: IconHome, render: (ctx) => <HomePanel onNavigate={ctx.setActiveTab} /> },
  { key: "explore", labelKey: "app.tab.explore", icon: IconExplore, render: (ctx) => <ExplorePanel onNavigate={ctx.setActiveTab} /> },
  {
    key: "master",
    labelKey: "app.tab.master",
    icon: IconMaster,
    group: "app.navGroup.create",
    render: (ctx) => <MasteringConsole onOpenHelp={() => ctx.setActiveTab("help")} onOpenBilling={() => ctx.setActiveTab("plans")} />,
  },
  {
    key: "chords",
    labelKey: "app.tab.chords",
    icon: IconChords,
    group: "app.navGroup.analyze",
    render: (ctx) => <ChordsPanel onMasterThisSong={() => ctx.setActiveTab("master")} />,
  },
  { key: "myMasters", labelKey: "app.tab.myMasters", icon: IconMyMasters, group: "app.navGroup.library", render: (ctx) => <MyMastersPanel onNavigate={ctx.setActiveTab} /> },
  { key: "plans", labelKey: "app.tab.plans", icon: IconBilling, render: () => <PlansPanel /> },
  { key: "settings", labelKey: "app.tab.settings", icon: IconSettings, render: (ctx) => <SettingsPanel onReplayTutorial={() => ctx.setShowTutorial(true)} onOpenBilling={() => ctx.setActiveTab("plans")} /> },
  { key: "help", labelKey: "app.tab.help", icon: IconHelp, render: () => <HelpSupportPanel /> },
];

// Sidebar/mobile-menu nav renders Home first (the default landing tab,
// matching the reference dashboard), then grouped tabs under their
// section header, then every settings/help tab as a flat trailing list.
// `plans` is excluded since the reference's own nav doesn't list billing
// as a tab, only as the clickable usage widget (EntitlementsBadge already
// does this); `explore` is excluded too — it's reachable from Home's
// "Explore all tools" links and from search, not its own sidebar row,
// matching the reference exactly (no separate "Explore" nav item there).
const TOP_TABS = TABS.filter((tab) => tab.key === "home");
const NAV_GROUPS = [
  { key: "app.navGroup.create", tabs: TABS.filter((tab) => tab.group === "app.navGroup.create") },
  { key: "app.navGroup.analyze", tabs: TABS.filter((tab) => tab.group === "app.navGroup.analyze") },
  { key: "app.navGroup.library", tabs: TABS.filter((tab) => tab.group === "app.navGroup.library") },
];
const BOTTOM_TABS = TABS.filter((tab) => !tab.group && tab.key !== "plans" && tab.key !== "explore" && tab.key !== "home");

// Real, working search — not a decorative box. Matches against the tabs
// that actually exist (including the deep-link-only Explore cards for
// Reference Mastering / Stem Separation, which live inside the Mastering
// tab rather than as tabs of their own) and jumps straight there.
const SEARCH_INDEX = [
  { id: "home", labelKey: "app.tab.home", goTo: "home" },
  { id: "master", labelKey: "app.tab.master", goTo: "master" },
  { id: "reference", labelKey: "app.explore.reference.title", goTo: "master" },
  { id: "stems", labelKey: "app.explore.stems.title", goTo: "master" },
  { id: "chords", labelKey: "app.tab.chords", goTo: "chords" },
  { id: "myMasters", labelKey: "app.tab.myMasters", goTo: "myMasters" },
  { id: "explore", labelKey: "app.tab.explore", goTo: "explore" },
  { id: "plans", labelKey: "app.tab.plans", goTo: "plans" },
  { id: "settings", labelKey: "app.tab.settings", goTo: "settings" },
  { id: "help", labelKey: "app.tab.help", goTo: "help" },
];

const SIDEBAR_PREF_KEY = "sidebarOpen";

function SidebarNavButton({ tab, isActive, sidebarOpen, t, onClick }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={sidebarOpen ? undefined : t(tab.labelKey)}
      className={`flex items-center rounded-lg text-[12.5px] font-medium transition ${
        sidebarOpen ? "gap-2.5 px-2.5 py-2" : "h-9 w-9 justify-center"
      } ${isActive ? "bg-black/[0.05] text-text-primary" : "text-text-secondary hover:bg-black/[0.045] hover:text-text-primary"}`}
    >
      <Icon />
      {sidebarOpen ? <span className="truncate">{t(tab.labelKey)}</span> : null}
    </button>
  );
}

function MobileNavButton({ tab, isActive, t, onClick }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${
        isActive ? "bg-black/[0.05] text-text-primary" : "text-text-secondary active:bg-black/[0.045]"
      }`}
    >
      <Icon />
      {t(tab.labelKey)}
    </button>
  );
}

export default function AppClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?job=<jobId> drives the result view — a query param on this same
  // page, not a separate route (there used to be a /app/masters/:jobId
  // page; it was a regression, not an improvement: Next.js mounted a
  // whole fresh page for it — new sidebar, new topbar, every mount-time
  // effect re-running — instead of the instant in-place switch the old
  // tab-state version had. A query param on the SAME page fixes both
  // problems at once: navigating between "My Masters" and a specific
  // result is a soft navigation (same component stays mounted, only
  // useSearchParams()'s value changes, confirmed no remount), and it's
  // still a real URL a refresh can restore (MasterResultView fetches by
  // jobId regardless of how it got the id).
  const jobIdParam = searchParams.get("job");
  const { t, lang, setLang } = useLanguage();
  const { user, loading, signOut } = useAuthStore();
  // ?tab=myMasters (from MasterResultView's "View All My Masters", or any
  // other future deep link into a specific tab) — read once on mount, not
  // synced continuously, same as every other tab switch that follows.
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get("tab");
    return TABS.some((tab) => tab.key === requested) ? requested : "home";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop sidebar on/off — separate from menuOpen (that's the mobile
  // dropdown). Persisted so the choice sticks across reloads.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // The one thing every sidebar/menu/badge nav click must go through —
  // plain setActiveTab(key) alone was a real bug: showResultView is
  // driven by ?job= in the URL (see jobIdParam above), not by
  // `activeTab`, so switching tabs while `?job=` was still set changed
  // nothing on screen — the sidebar looked dead because <main> kept
  // rendering MasterResultView regardless of activeTab. Pushing a plain
  // /app?tab=<key> URL (no job=) is what actually leaves the result view;
  // setActiveTab alongside it keeps the sidebar highlight in sync
  // immediately rather than waiting on the next render's searchParams read.
  const goToTab = (tabKey) => {
    setActiveTab(tabKey);
    router.push(`/app?tab=${tabKey}`);
  };

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
  //
  // router.push to ?job=<id> on this same page (not a separate route —
  // see the jobIdParam comment above) — that's what makes refreshing the
  // result view not lose the data: MasterResultView fetches GET
  // /jobs/:jobId fresh by that id (see its own comment) rather than
  // reading in-memory Zustand state a refresh would wipe. recordJob on
  // the backend is awaited before /master's response returns for a real
  // render, so the data is already there by the time that fetch runs.
  //
  // `lastAutoNavJobId` guards against re-firing for the same finished job
  // — without it, a subsequent render with the same `masteringResult`
  // (e.g. some unrelated state update on this page) would push again and
  // fight the user navigating elsewhere/back. Since this is a soft
  // navigation on one persistent page instance now (confirmed no
  // remount), the ref survives exactly as long as it needs to; unlike the
  // old separate-route version, nothing here has to also clear the store
  // to stop a remount from re-triggering it — acknowledgeResult() still
  // runs, but only as a courtesy (dismisses NotificationBanner's "your
  // master is ready" toast immediately, since the user's now looking
  // right at it), not load-bearing for correctness anymore.
  const masteringResult = useMasteringStore((s) => s.result);
  const acknowledgeResult = useMasteringStore((s) => s.acknowledgeResult);
  const lastAutoNavJobId = useRef(null);
  useEffect(() => {
    if (!masteringResult?.job_id || masteringResult.preview) return;
    if (masteringResult.job_id === lastAutoNavJobId.current) return;
    lastAutoNavJobId.current = masteringResult.job_id;
    refreshEntitlements();
    router.push(`/app?job=${masteringResult.job_id}`);
    acknowledgeResult();
  }, [masteringResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen render-status overlay — one shared timeline (see the hook's
  // own comment) drives it regardless of which tab is active underneath,
  // so it still shows even if the user switches tabs mid-render.
  const { elapsedSec: masteringElapsedSec } = useMasteringProgress();
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

  // Driven by ?job=, not a sidebar tab — deliberately absent from TABS so
  // it never appears in the nav lists below. MasterResultView fetches its
  // own data by jobId, so this component doesn't need to know anything
  // about the job itself beyond the id.
  const showResultView = Boolean(jobIdParam);
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
    <div className="flex h-screen flex-col overflow-hidden" style={{ height: "100dvh" }}>
      <VerifyEmailBanner />
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
      {/* Mobile top bar — the sidebar below is hidden on small screens */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg p-3.5 md:hidden">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-text-primary">
          <LogoMark size={22} />
        </Link>
        <AppSearch index={SEARCH_INDEX} onSelect={goToTab} className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={t("app.menu")}
          className="flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-border-subtle"
        >
          <span className={`h-px w-4 bg-text-primary transition ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`} />
          <span className={`h-px w-4 bg-text-primary transition ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`h-px w-4 bg-text-primary transition ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`} />
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
          className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col border-l border-border-subtle bg-bg p-5 shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between pb-6">
            <Link href="/" className="flex items-center gap-2.5 text-text-primary" onClick={() => setMenuOpen(false)}>
              <LogoMark size={22} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Auralith Forge</span>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("app.closeMenu")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle text-lg text-text-secondary"
            >
              ✕
            </button>
          </div>

          <div className="mb-4">
            <EntitlementsBadge onClick={() => { goToTab("plans"); setMenuOpen(false); }} className="w-full justify-center" />
          </div>

          <nav className="flex flex-col gap-4 overflow-y-auto">
            {TOP_TABS.map((tab) => (
              <MobileNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} t={t} onClick={() => { goToTab(tab.key); setMenuOpen(false); }} />
            ))}
            {NAV_GROUPS.map((group) => (
              <div key={group.key}>
                <p className="mb-1.5 px-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{t(group.key)}</p>
                <div className="flex flex-col gap-1">
                  {group.tabs.map((tab) => (
                    <MobileNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} t={t} onClick={() => { goToTab(tab.key); setMenuOpen(false); }} />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
              {BOTTOM_TABS.map((tab) => (
                <MobileNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} t={t} onClick={() => { goToTab(tab.key); setMenuOpen(false); }} />
              ))}
            </div>
          </nav>

          <div className="flex-1" />

          <div className="border-t border-border-subtle pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 break-all text-xs text-text-secondary">{user.email}</p>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg border border-border-subtle px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-primary active:bg-black/[0.045]"
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
        className={`hidden shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-bg transition-[width] duration-150 md:flex ${
          sidebarOpen ? "w-[220px] p-3" : "w-[60px] items-center p-2"
        }`}
      >
        <div className={`flex items-center pb-5 pt-1.5 ${sidebarOpen ? "justify-between px-1.5" : "flex-col gap-3"}`}>
          <Link href="/" className="flex items-center gap-2 text-text-primary" title="Auralith Forge">
            <LogoMark size={20} />
            {sidebarOpen ? <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Auralith Forge</span> : null}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? t("app.collapseMenu") : t("app.expandMenu")}
            title={sidebarOpen ? t("app.collapseMenu") : t("app.expandMenu")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-black/[0.04] hover:text-text-primary"
          >
            {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
          </button>
        </div>


        <nav className={`flex flex-col gap-4 ${sidebarOpen ? "" : "items-center"}`}>
          {TOP_TABS.map((tab) => (
            <SidebarNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} sidebarOpen={sidebarOpen} t={t} onClick={() => goToTab(tab.key)} />
          ))}
          {NAV_GROUPS.map((group) => (
            <div key={group.key}>
              {sidebarOpen ? <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{t(group.key)}</p> : null}
              <div className={`flex flex-col gap-0.5 ${sidebarOpen ? "" : "items-center"}`}>
                {group.tabs.map((tab) => (
                  <SidebarNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} sidebarOpen={sidebarOpen} t={t} onClick={() => goToTab(tab.key)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex-1" />

        <div className={`flex flex-col gap-0.5 border-t border-border-subtle pt-3 ${sidebarOpen ? "" : "items-center"}`}>
          {BOTTOM_TABS.map((tab) => (
            <SidebarNavButton key={tab.key} tab={tab} isActive={activeTab === tab.key} sidebarOpen={sidebarOpen} t={t} onClick={() => goToTab(tab.key)} />
          ))}
        </div>

        {sidebarOpen ? (
          <div className="mt-3 border-t border-border-subtle px-0.5 pt-3">
            <div className="mb-2">
              <EntitlementsBadge onClick={() => goToTab("plans")} className="w-full justify-center" />
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[11px] text-text-secondary" title={user.email}>
                {user.email}
              </p>
              <LanguageSwitch lang={lang} setLang={setLang} />
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg border border-border-subtle px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30"
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
            className="mt-3 flex h-9 w-9 items-center justify-center rounded-lg border-t border-border-subtle text-text-secondary hover:text-text-primary"
          >
            ⏻
          </button>
        )}
      </aside>

      {/* min-h-0/min-w-0 wrapper — same reasoning as <main>'s own comment
          below, just one level up now that a persistent top bar sits
          beside it in this column. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Desktop-only top bar (mobile already has its own, above) —
            search, the real notifications bell, and a quick account
            shortcut, matching the reference dashboard's header row. */}
        <div className="hidden shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-3.5 md:flex md:px-10">
          <AppSearch index={SEARCH_INDEX} onSelect={goToTab} className="w-full max-w-md" />
          <div className="flex shrink-0 items-center gap-1.5">
            <AppNotificationsBell onViewResult={() => goToTab("master")} />
            <button
              type="button"
              onClick={() => goToTab("settings")}
              title={user.email}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle text-sm font-semibold text-text-primary hover:border-text-primary/30"
            >
              {(user.email || "?")[0].toUpperCase()}
            </button>
          </div>
        </div>

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
        {/* Keyed fade on tab/view switches — mode="wait" plus a fast
            (150ms) fade keeps switching feeling instant while still
            reading as a deliberate transition rather than content
            teleporting. Keyed by which view is showing (result view vs.
            tab key), so in-view state changes never re-trigger it. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={showResultView ? `job-${jobIdParam}` : active.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {showResultView ? (
              <MasterResultView
                jobId={jobIdParam}
                onMasterAnother={() => goToTab("master")}
                onViewAllMasters={() => goToTab("myMasters")}
              />
            ) : (
              active.render({ setActiveTab: goToTab, setShowTutorial })
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      </div>

      <NotificationBanner activeTab={activeTab} onView={() => goToTab("master")} />
      {showTutorial ? <OnboardingTour onDone={dismissTutorial} /> : null}
      <MasteringLoaderOverlay visible={isMasteringSubmitting} elapsedSec={masteringElapsedSec} />
      </div>
    </div>
  );
}
