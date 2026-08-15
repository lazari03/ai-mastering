"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import CleanAudioPanel from "@/app/ui/CleanAudioPanel";
import ChordsPanel from "@/app/ui/ChordsPanel";
import MasteringConsole from "@/app/ui/MasteringConsole";
import { useAuthStore } from "@/store/authStore";

const TABS = [
  { key: "clean", label: "Clean Audio", render: () => <CleanAudioPanel /> },
  { key: "master", label: "Master Audio", render: () => <MasteringConsole /> },
  { key: "chords", label: "Show Chords", render: () => <ChordsPanel /> },
];

export default function AppPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuthStore();
  const [activeTab, setActiveTab] = useState("master");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

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
    <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-4 md:px-8 md:py-12">
      <nav className="mx-auto mb-6 flex w-full max-w-7xl flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
              activeTab === tab.key
                ? "border-ember bg-ember/20 text-ember"
                : "border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500">{user.email}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-zinc-300 hover:border-white/30"
          >
            Sign out
          </button>
        </div>
      </nav>

      {active.render()}
    </main>
  );
}
