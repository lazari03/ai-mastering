"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { LOUDNESS_TARGETS } from "@/content/loudnessTargets";
import { useLanguage } from "@/lib/i18n";
import LoudnessMeter from "@/components/audio/LoudnessMeter";
import SectionHeading from "@/components/marketing/SectionHeading";

// Joins the marketing copy (genrePages.js) with the real DSP numbers
// (loudnessTargets.js, the same table the engine is built from) into one
// interactive selector — click a genre, see its actual target profile.
// Replaces a static link list with one component instead of duplicating
// this join wherever a genre list is needed.
export default function GenreShowcase() {
  const { t } = useLanguage();
  const [active, setActive] = useState(GENRE_KEYS[0]);
  const activePage = GENRE_PAGES[active];
  const activeTarget = LOUDNESS_TARGETS.find((g) => g.genre === active);

  return (
    <section className="reveal relative mt-24 scroll-mt-28 pb-[4.5rem] pt-[4.5rem]">
      {/* Full-bleed tint, same technique as HomeClient.jsx's Gallery/How-to
          sections — a real background-zone change instead of a hairline,
          valid here because this section is centered in the viewport
          same as every other homepage section. */}
      <div className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.035]" aria-hidden="true" />
      <SectionHeading eyebrow={t("genres.eyebrow")} title={t("genres.title")} subtitle={t("genres.body")} />

      <div className="mt-9 flex flex-wrap gap-2">
        {GENRE_KEYS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setActive(g)}
            aria-pressed={active === g}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              active === g
                ? "border-text-primary bg-text-primary text-bg"
                : "border-border-subtle text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
            }`}
          >
            {GENRE_PAGES[g].label}
          </button>
        ))}
      </div>

      {activePage ? (
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-5 rounded-[20px] border border-border-subtle bg-bg p-6"
        >
          <p className="m-0 text-base leading-relaxed text-text-secondary">{activePage.intro}</p>
          {activeTarget ? (
            <LoudnessMeter className="mt-5 max-w-sm" targetLufs={activeTarget.targetLufs} />
          ) : null}
          <Link
            href={`/master/${active}`}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent"
          >
            {t("genres.cta", { genre: activePage.label })}
          </Link>
        </motion.div>
      ) : null}
    </section>
  );
}
