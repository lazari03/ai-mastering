"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { GENRE_PAGES, GENRE_KEYS } from "@/content/genrePages";
import { LOUDNESS_TARGETS } from "@/content/loudnessTargets";
import { useLanguage } from "@/lib/i18n";
import LoudnessMeter from "@/components/audio/LoudnessMeter";

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
    <section className="reveal mt-16 scroll-mt-24">
      <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-brass">{t("genres.eyebrow")}</p>
      <h2 className="mt-2 font-[var(--font-title)] text-2xl text-white sm:text-3xl">{t("genres.title")}</h2>
      <p className="mt-2 max-w-xl text-sm text-zinc-400">{t("genres.body")}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {GENRE_KEYS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setActive(g)}
            aria-pressed={active === g}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              active === g
                ? "border-brass/60 bg-brass/[0.18] text-brass"
                : "border-border-subtle bg-black/20 text-zinc-300 hover:border-brass/50 hover:text-brass"
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
          className="mt-5 rounded-[20px] border border-border-subtle p-6"
          style={{ background: "linear-gradient(145deg, rgba(27,30,34,.78), rgba(15,17,19,.92))" }}
        >
          <p className="m-0 text-sm leading-relaxed text-zinc-300">{activePage.intro}</p>
          {activeTarget ? (
            <LoudnessMeter className="mt-5 max-w-sm" targetLufs={activeTarget.targetLufs} />
          ) : null}
          <Link
            href={`/master/${active}`}
            className="mt-5 inline-block rounded-full border border-brass/50 bg-brass/[0.18] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brass hover:bg-brass/25"
          >
            {t("genres.cta", { genre: activePage.label })}
          </Link>
        </motion.div>
      ) : null}
    </section>
  );
}
