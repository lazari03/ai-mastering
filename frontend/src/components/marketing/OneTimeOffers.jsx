"use client";

import Link from "next/link";
import { SINGLE_MASTER, STEM_SEPARATION, localized } from "@/lib/pricing";
import { oneTimeSignupHref } from "@/lib/internalLinks";
import { useLanguage } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

export default function OneTimeOffers({ source = "pricing" }) {
  const { lang } = useLanguage();
  const sq = lang === "sq";
  return (
    <section id="pay-per-track" aria-labelledby={`${source}-one-time-title`} className="mt-8 rounded-2xl border border-border-subtle bg-white/60 p-6 sm:p-8">
      <h2 id={`${source}-one-time-title`} className="m-0 text-[24px] font-semibold text-text-primary">
        {sq ? "Vetëm një këngë? Paguaj për master." : "Just one track? Pay per master."}
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        {sq ? "Pa abonim. Pa rinovim automatik. Të disponueshme në çdo plan." : "No subscription. No automatic renewal. Available on every plan."}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[SINGLE_MASTER, STEM_SEPARATION].map((product) => (
          <article key={product.item} className="flex flex-col rounded-xl border border-border-subtle p-5">
            <h3 className="m-0 text-lg font-semibold text-text-primary">
              {product.item === "single_master" ? (sq ? "Një master" : "Single Master") : (sq ? "Shtesë për ndarje stem-esh" : "Stem Separation Add-on")}
              <span className="ml-2">{product.price}</span>
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{localized(product.blurb, lang)}</p>
            <Link
              href={oneTimeSignupHref(product.item)}
              onClick={() => trackEvent("cta_click", { cta_id: `buy_${product.item}`, location: source, item: product.item })}
              className="btn-primary mt-auto self-start"
            >
              {sq ? `Zgjidh këtë opsion — ${product.price}` : `Choose this option — ${product.price}`}
            </Link>
          </article>
        ))}
      </div>
      <p className="mb-0 mt-4 text-sm text-text-secondary">
        {sq
          ? `Nëse kuota e masterizimit ka mbaruar: ${SINGLE_MASTER.price} për masterin + ${STEM_SEPARATION.price} për ndarjen. Pa përmirësim plani.`
          : `If your mastering allowance is exhausted: ${SINGLE_MASTER.price} for the master + ${STEM_SEPARATION.price} for separation. No plan upgrade required.`}
      </p>
    </section>
  );
}
