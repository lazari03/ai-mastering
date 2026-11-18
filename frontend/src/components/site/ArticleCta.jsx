"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { CTA } from "@/lib/internalLinks";
import { PLANS } from "@/lib/pricing";

const FREE = PLANS.free.masterLimit;
const FREE_TEXT = FREE === 1 ? "1 full-length master free" : `${FREE} full-length masters free`;

// In-article conversion block. The page-end CtaBand sits below related
// links and "More guides", which most readers never reach; this one sits
// inside the prose where the reader has just been told what mastering
// fixes. cta_click carries the article slug and position so the SEO tab
// can attribute signups to the article that produced them.
export default function ArticleCta({ slug, position, title, body }) {
  const onClick = (ctaId) => trackEvent("cta_click", { cta_id: ctaId, location: `blog_${position}`, article: slug });
  return (
    <aside className="af-cta my-10 rounded-2xl border border-accent/30 bg-accent/[0.06] p-6" aria-label="Try Auralith Forge">
      <p className="m-0 text-[17px] font-semibold leading-snug text-text-primary">{title}</p>
      {body ? <p className="m-0 mt-2 text-[15px] leading-[1.6] text-text-secondary">{body}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={CTA.signup} className="btn-primary" onClick={() => onClick("blog_master_free")}>
          Master a track free <span aria-hidden="true">→</span>
        </Link>
        <Link href="/lufs-meter" className="text-[14px] font-medium text-text-primary underline decoration-black/20 underline-offset-4 hover:text-accent" onClick={() => onClick("blog_lufs_meter")}>
          Or check your mix&apos;s loudness first
        </Link>
      </div>
      <p className="m-0 mt-3 text-[12px] text-text-secondary">{FREE_TEXT}, no card. Level-matched A/B before you download.</p>
    </aside>
  );
}
