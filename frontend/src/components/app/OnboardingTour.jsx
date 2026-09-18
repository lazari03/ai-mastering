"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { useLanguage } from "@/lib/i18n";

// First-time-only walkthrough. Gated by profile.tutorialShown (Firestore,
// see profileService.js) — AppClient shows this once profile loads and the
// flag is false, and marks it true (forever) on finish/skip either way.
//
// Images are real Pexels photos (free license, no attribution required),
// loaded via next/image so they're optimized/cached — not third-party
// script weight, just static images from a domain next.config.mjs already
// allowlists. Every step uses the exact same image box height so the
// modal never resizes as you click through it.
const STEP_IMAGES = [
  "https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/3971985/pexels-photo-3971985.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/3784221/pexels-photo-3784221.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/2114014/pexels-photo-2114014.jpeg?auto=compress&cs=tinysrgb&w=800",
];

export default function OnboardingTour({ onDone }) {
  const { t } = useLanguage();
  const STEPS = useMemo(
    () =>
      STEP_IMAGES.map((image, i) => ({
        title: t(`onboarding.s${i}.title`),
        body: t(`onboarding.s${i}.body`),
        image,
      })),
    [t]
  );
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg shadow-2xl">
        {/* Fixed-height image box, same on every step — nothing about the
            modal's size ever changes as you click through it. Text
            overlaying the photo stays explicitly white regardless of the
            site's light/dark theme — it's sitting on a real photo behind a
            dark scrim, not on the page background. */}
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0d] via-[#0c0c0d]/20 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white backdrop-blur-sm">
              {step + 1} / {STEPS.length}
            </span>
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-white backdrop-blur-sm hover:bg-black/70"
            >
              {t("onboarding.skip")}
            </button>
          </div>
          <h2 className="absolute inset-x-0 bottom-0 p-4 text-xl text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
            {current.title}
          </h2>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {/* Fixed min-height so shorter/longer body copy across steps
              doesn't shift the footer/buttons up and down either. */}
          <p className="min-h-[64px] text-sm leading-relaxed text-text-secondary">{current.body}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <span key={s.title} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent" : "bg-black/[0.05]"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-border-subtle bg-black/[0.03] px-3.5 py-2 text-xs text-text-secondary hover:border-text-primary/30"
                >
                  {t("onboarding.back")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
                className="rounded-lg border border-border-subtle bg-black/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-accent hover:bg-accent/30"
              >
                {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
