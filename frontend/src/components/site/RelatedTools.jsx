"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/i18n";
import { loc, relatedTools, STUDIO_GROUPS } from "@/lib/studio";

// "Related tools" block, driven by lib/studio.js so it only ever lists
// real products. Descriptive anchor text (the tool's name + what it does),
// not a repeated "click here" or keyword-stuffed link.
export default function RelatedTools({ current, keys, title }) {
  const { lang, t } = useLanguage();
  const tools = keys ? keys.map((k) => STUDIO_GROUPS.flatMap((g) => g.tools).find((x) => x.key === k)).filter(Boolean) : relatedTools(current);
  if (!tools.length) return null;
  return (
    <section className="mt-20 sm:mt-24" aria-labelledby="related-tools-title">
      <h2 id="related-tools-title" className="m-0 font-[var(--font-title)] text-[24px] font-semibold tracking-[-0.02em] text-text-primary sm:text-[28px]">
        {title || t("studio.relatedTools")}
      </h2>
      <ul className="m-0 mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => (
          <li key={tool.key}>
            <Link
              href={tool.href}
              className="group flex h-full flex-col rounded-2xl border border-border-subtle bg-white/55 p-5 transition duration-300 hover:border-text-primary/30 hover:bg-white"
            >
              <span className="text-[15px] font-semibold text-text-primary">{loc(tool.name, lang)}</span>
              <span className="mt-1.5 text-[14px] leading-[1.55] text-text-secondary">{loc(tool.blurb, lang)}</span>
              <span className="mt-auto pt-4 text-[13px] font-semibold text-text-primary">
                {tool.appOnly ? t("studio.openInApp") : t("studio.openTool")}{" "}
                <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
