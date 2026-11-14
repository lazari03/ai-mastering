"use client";

import ABMasterPlayer from "@/components/audio/ABMasterPlayer";
import { useLanguage } from "@/lib/i18n";

/**
 * Before/after player for a /master/<genre> page — the same level-matched
 * A/B as the homepage demo (HearTheDifference.jsx), for the one demo in
 * lib/beforeAfterDemos.js whose genreKey matches the page. The page only
 * renders this when such a demo exists, so a genre without real audio
 * shows nothing rather than a placeholder.
 */
export default function GenreDemo({ demo }) {
  const { t } = useLanguage();
  const gap = Number(demo.loudnessGapDb) || 0;
  return (
    <div className="bezel max-w-[720px]">
      <div className="bezel-core p-3 sm:p-4">
        <p className="m-0 px-1 pb-3 pt-1 text-[14px] font-semibold text-text-primary">
          {demo.label}
          <span className="ml-2 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">{demo.genre}</span>
        </p>
        <ABMasterPlayer
          beforeSrc={demo.beforeSrc}
          afterSrc={demo.afterSrc}
          beforeGainDb={0}
          afterGainDb={-gap}
          defaultLevelMatch
          levelMatchNote={t("hearIt.matchedNote")}
          beforeLabel={t("result.before")}
          afterLabel={t("result.after")}
          preparingLabel={t("result.preparingAb")}
        />
      </div>
    </div>
  );
}
