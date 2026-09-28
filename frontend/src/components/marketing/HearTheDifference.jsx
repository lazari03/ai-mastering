"use client";

import ABMasterPlayer from "@/components/audio/ABMasterPlayer";
import { DEMO_MASTER } from "@/content/demoMaster";
import { BEFORE_AFTER_DEMOS } from "@/lib/beforeAfterDemos";
import { summarizeDecisions } from "@/lib/masteringDecisions";
import { useLanguage } from "@/lib/i18n";

const DEMO = BEFORE_AFTER_DEMOS[0];
const COUNTS = summarizeDecisions(DEMO_MASTER)?.counts || { corrections: 0, untouched: 0 };
// How much louder the master is than the mix — attenuating the master by
// this much makes Before/After a fair comparison of what changed, not of
// which one is louder (louder almost always wins a quick A/B).
const LOUDNESS_GAP_DB = DEMO_MASTER.after_lufs - DEMO_MASTER.before_lufs;

/**
 * The homepage demo, right under the hero: the same instant A/B player
 * and waveform the real result page uses (ABMasterPlayer), on real engine
 * output (content/demoMaster.js). It used to sit in the hero's right
 * column; that spot now belongs to the upload panel.
 */
export default function HearTheDifference() {
  const { t } = useLanguage();
  if (!DEMO) return null;

  const stats = [
    { label: t("hero.demo.loudness"), value: `${DEMO_MASTER.before_lufs.toFixed(1)} → ${DEMO_MASTER.after_lufs.toFixed(1)}`, unit: "LUFS" },
    { label: t("hero.demo.truePeak"), value: `${DEMO_MASTER.analysis_before.true_peak_db.toFixed(1)} → ${DEMO_MASTER.analysis_after.true_peak_db.toFixed(1)}`, unit: "dBTP" },
    { label: t("hero.demo.decisions"), value: t("hero.demo.counts", { c: COUNTS.corrections, u: COUNTS.untouched }), unit: "" },
  ];

  return (
    <section id="hear-it" className="reveal mt-20 scroll-mt-28 sm:mt-24">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-16 [&>*]:min-w-0">
        <div>
          <p className="eyebrow m-0">{t("hearIt.eyebrow")}</p>
          <h2
            className="mt-4 font-[var(--font-title)] text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[44px]"
            style={{ textWrap: "balance" }}
          >
            {t("hearIt.title")}
          </h2>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.7] text-text-secondary" style={{ textWrap: "pretty" }}>
            {t("hearIt.body")}
          </p>

          <dl className="m-0 mt-8 max-w-[460px] divide-y divide-black/[0.07] border-y border-black/[0.07]">
            {stats.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">{s.label}</dt>
                <dd className="m-0 whitespace-nowrap font-mono text-[14px] text-text-primary">
                  {s.value}
                  {s.unit ? <span className="text-text-secondary"> {s.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bezel">
          <div className="bezel-core p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 pt-1">
              <p className="m-0 text-[14px] font-semibold text-text-primary">
                {DEMO.label}
                <span className="ml-2 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">{DEMO.genre}</span>
              </p>
            </div>
            <ABMasterPlayer
              beforeSrc={DEMO.beforeSrc}
              afterSrc={DEMO.afterSrc}
              beforeGainDb={0}
              afterGainDb={-LOUDNESS_GAP_DB}
              // The player's own level-match control, on by default for a
              // demo: an unmatched A/B flatters whichever side is louder.
              defaultLevelMatch
              levelMatchNote={t("hearIt.matchedNote")}
              beforeLabel={t("result.before")}
              afterLabel={t("result.after")}
              preparingLabel={t("result.preparingAb")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
