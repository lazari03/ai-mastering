"use client";

import SectionHeading from "@/components/marketing/SectionHeading";
import { TESTIMONIALS } from "@/content/testimonials";
import { useLanguage } from "@/lib/i18n";

/**
 * Homepage customer quotes, placed right before pricing. Renders nothing
 * while content/testimonials.js is empty — see that file for what may go
 * in it (real, permissioned, exact quotes only).
 */
export default function Testimonials() {
  const { t } = useLanguage();
  if (!TESTIMONIALS.length) return null;
  return (
    <section id="testimonials" className="reveal mt-24 scroll-mt-28">
      <SectionHeading eyebrow={t("testimonials.eyebrow")} title={t("testimonials.title")} />
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((item) => (
          <figure key={`${item.name}-${item.quote.slice(0, 24)}`} className="m-0 flex flex-col justify-between rounded-2xl border border-border-subtle bg-white/55 p-6">
            <blockquote className="m-0 text-[15px] leading-[1.65] text-text-primary" style={{ textWrap: "pretty" }}>
              “{item.quote}”
            </blockquote>
            <figcaption className="mt-5 text-[13px] text-text-secondary">
              {item.href ? (
                <a href={item.href} rel="noopener noreferrer nofollow" target="_blank" className="font-semibold text-text-primary underline decoration-black/20 underline-offset-4 hover:text-accent">
                  {item.name}
                </a>
              ) : (
                <span className="font-semibold text-text-primary">{item.name}</span>
              )}
              {item.role ? <span> · {item.role}</span> : null}
              {item.disclosure ? <span className="mt-1 block text-[11px]">{item.disclosure}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
