"use client";

import { useState } from "react";
import Image from "next/image";

// First-time-only walkthrough. Gated by profile.tutorialShown (Firestore,
// see profileService.js) — AppClient shows this once profile loads and the
// flag is false, and marks it true (forever) on finish/skip either way.
//
// Images are real Pexels photos (free license, no attribution required),
// loaded via next/image so they're optimized/cached — not third-party
// script weight, just static images from a domain next.config.mjs already
// allowlists. Every step uses the exact same image box height so the
// modal never resizes as you click through it.
const STEPS = [
  {
    title: "Welcome to Auralith Forge",
    body: "A quick tour of how mastering works here — four steps, less than a minute.",
    image: "https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "1. Choose your audio",
    body: "Drop a track in Master Audio. Want to match a reference song's tone instead? Upload that too — Reference mode takes over automatically.",
    image: "https://images.pexels.com/photos/3971985/pexels-photo-3971985.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "2. Pick a mode",
    body: "Quick mode: pick a genre/style, the engine does the rest. Pro mode: hands-on control over EQ, compression, limiting. Saved Artists let you reuse an exact chain on future tracks.",
    image: "https://images.pexels.com/photos/3784221/pexels-photo-3784221.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "3. Master it",
    body: "Hit Master. Real processing runs — this isn't a preview, so it can take a moment, longer if stem separation is on.",
    image: "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "4. Review & share",
    body: "Finished masters land in My Masters — download, delete, or (on All-Access) generate a temporary share link. Files auto-expire after 48 hours, so grab what you need.",
    image: "https://images.pexels.com/photos/2114014/pexels-photo-2114014.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
];

export default function OnboardingTour({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brass/30 bg-[#161311] shadow-2xl">
        {/* Fixed-height image box, same on every step — nothing about the
            modal's size ever changes as you click through it. */}
        <div className="relative h-44 w-full shrink-0">
          <Image
            key={current.image}
            src={current.image}
            alt=""
            fill
            sizes="(max-width: 480px) 100vw, 448px"
            className="object-cover"
            priority={step === 0}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#161311] via-[#161311]/20 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-200 backdrop-blur-sm">
              {step + 1} / {STEPS.length}
            </span>
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-zinc-200 backdrop-blur-sm hover:bg-black/70"
            >
              Skip
            </button>
          </div>
          <h2 className="absolute inset-x-0 bottom-0 p-4 font-[var(--font-title)] text-xl text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
            {current.title}
          </h2>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {/* Fixed min-height so shorter/longer body copy across steps
              doesn't shift the footer/buttons up and down either. */}
          <p className="min-h-[64px] text-sm leading-relaxed text-zinc-300">{current.body}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <span key={s.title} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-brass" : "bg-white/15"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-white/15 bg-black/20 px-3.5 py-2 text-xs text-zinc-300 hover:border-white/30"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
                className="rounded-lg border border-brass/40 bg-brass/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-brass hover:bg-brass/30"
              >
                {isLast ? "Get started" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
