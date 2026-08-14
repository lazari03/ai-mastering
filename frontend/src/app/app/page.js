"use client";

import { useState } from "react";

import CleanAudioPanel from "@/app/ui/CleanAudioPanel";
import ChordsPanel from "@/app/ui/ChordsPanel";
import MasteringConsole from "@/app/ui/MasteringConsole";

const TABS = [
  { key: "clean", label: "Clean Audio", render: () => <CleanAudioPanel /> },
  { key: "master", label: "Master Audio", render: () => <MasteringConsole /> },
  { key: "chords", label: "Show Chords", render: () => <ChordsPanel /> },
];

export default function AppPage() {
  const [activeTab, setActiveTab] = useState("master");
  const active = TABS.find((tab) => tab.key === activeTab) || TABS[0];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-4 md:px-8 md:py-12">
      <nav className="mx-auto mb-6 flex w-full max-w-7xl flex-wrap gap-2">
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
      </nav>

      {active.render()}
    </main>
  );
}
