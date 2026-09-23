import Link from "next/link";

import SiteHeader from "@/components/marketing/SiteHeader";
import Footer from "@/components/Footer";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

// Layout primitives shared by every public route. Server components (no
// "use client") so every word of SEO copy is in the server-rendered HTML.
//
// Widths: "wide" 1232px content box (matches the header island and the
// homepage), "default" 1080px for tool/landing pages, "reading" 760px for
// long-form articles and legal text.
const WIDTHS = { wide: "max-w-[1232px]", default: "max-w-[1080px]", reading: "max-w-[760px]" };

export function PageShell({ children, width = "default", mainClassName = "" }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 sm:px-6">
        <SiteHeader />
      </div>
      <main id="main" className={`mx-auto w-full ${WIDTHS[width]} px-4 pb-24 pt-6 sm:px-6 ${mainClassName}`} style={{ minHeight: "auto" }}>
        {children}
      </main>
      <Footer />
    </>
  );
}

/** Visible breadcrumb trail + its BreadcrumbList schema (one source). */
export function Breadcrumbs({ items }) {
  return (
    <>
    <JsonLd data={breadcrumbJsonLd(items)} />
    <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-text-secondary">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {items.map((item, i) => (
          <li key={item.href || item.name} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="transition hover:text-text-primary">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-text-primary">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
    </>
  );
}

/**
 * Search-intent hero: the H1 says exactly what the page does, one short
 * lead paragraph, then the actual tool (children) — no scroll required to
 * reach it.
 */
export function PageHero({ eyebrow, title, lead, actions, children, aside }) {
  return (
    <header className="pt-4">
      <div className={aside ? "grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end" : ""}>
        <div>
          {eyebrow ? <p className="eyebrow m-0">{eyebrow}</p> : null}
          <h1
            className="mt-4 max-w-[20ch] font-[var(--font-title)] text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary sm:text-[56px] lg:text-[64px]"
            style={{ textWrap: "balance" }}
          >
            {title}
          </h1>
          {lead ? (
            <p className="mt-5 max-w-[62ch] text-[17px] leading-[1.65] text-text-secondary sm:text-lg" style={{ textWrap: "pretty" }}>
              {lead}
            </p>
          ) : null}
          {actions ? <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      {children ? <div className="mt-10">{children}</div> : null}
    </header>
  );
}

/** A content section with a real H2. `tone="band"` draws a full-bleed tint. */
export function Section({ id, eyebrow, title, intro, children, className = "", tone }) {
  const body = (
    <>
      {eyebrow ? <p className="eyebrow m-0">{eyebrow}</p> : null}
      {title ? (
        <h2
          className="mt-3 max-w-[28ch] font-[var(--font-title)] text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-text-primary sm:text-[36px]"
          style={{ textWrap: "balance" }}
        >
          {title}
        </h2>
      ) : null}
      {intro ? (
        <p className="mt-4 max-w-[64ch] text-[16px] leading-[1.7] text-text-secondary" style={{ textWrap: "pretty" }}>
          {intro}
        </p>
      ) : null}
      {children ? <div className={title || intro ? "mt-8" : ""}>{children}</div> : null}
    </>
  );
  if (tone === "band") {
    return (
      <section id={id} className={`relative isolate mt-20 scroll-mt-28 py-16 sm:mt-24 ${className}`}>
        <div aria-hidden="true" className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-black/[0.025]" />
        {body}
      </section>
    );
  }
  return (
    <section id={id} className={`mt-20 scroll-mt-28 sm:mt-24 ${className}`}>
      {body}
    </section>
  );
}

/** The frame a live tool sits in — the same bezel as the homepage demo. */
export function ToolFrame({ label, children, footer }) {
  return (
    <div className="bezel">
      <div className="bezel-core p-4 sm:p-6">
        {label ? (
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="m-0 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
              {label}
            </p>
          </div>
        ) : null}
        {children}
        {footer ? <div className="mt-4 border-t border-border-subtle pt-4 text-[13px] text-text-secondary">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Numbered process — an ordered list, not decorative cards. */
export function Steps({ steps }) {
  return (
    <ol className="m-0 grid list-none gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle p-0 md:grid-cols-3">
      {steps.map(([n, title, body]) => (
        <li key={n} className="bg-bg p-6">
          <p className="m-0 font-mono text-xs text-text-secondary">{n}</p>
          <h3 className="mt-3 text-[17px] font-semibold text-text-primary">{title}</h3>
          <p className="mt-2 text-[15px] leading-[1.65] text-text-secondary">{body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Feature/benefit list with checkmarks. */
export function Checklist({ items, columns = 1 }) {
  return (
    <ul className={`m-0 grid list-none gap-x-10 gap-y-4 p-0 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {items.map((item) => (
        <li key={typeof item === "string" ? item : item.title} className="flex gap-3 text-[15px] leading-[1.65] text-text-primary">
          <span aria-hidden="true" className="mt-[7px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent">
            ✓
          </span>
          <span>
            {typeof item === "string" ? (
              item
            ) : (
              <>
                <strong className="font-semibold">{item.title}</strong> <span className="text-text-secondary">{item.body}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * FAQ rendered fully visible (question = H3, answer = paragraph) — the
 * content is part of the page, not hidden behind an interaction. Pair
 * with faqJsonLd from lib/seo.
 */
export function Faq({ items }) {
  return (
    <div className="divide-y divide-border-subtle border-y border-border-subtle">
      {items.map((item) => (
        <div key={item.question} className="grid gap-2 py-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10">
          <h3 className="m-0 text-[17px] font-semibold leading-snug text-text-primary">{item.question}</h3>
          <p className="m-0 text-[15px] leading-[1.7] text-text-secondary">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

/** Closing call to action — a dark stage, echoing the homepage hero. */
export function CtaBand({ title, body, primary, secondary }) {
  return (
    <section className="mt-24 overflow-hidden rounded-[28px] bg-dark-bg px-6 py-12 text-dark-text-primary sm:px-12 sm:py-16">
      <h2
        className="m-0 max-w-[24ch] font-[var(--font-title)] text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[40px]"
        style={{ textWrap: "balance" }}
      >
        {title}
      </h2>
      {body ? <p className="mt-4 max-w-[56ch] text-[16px] leading-[1.7] text-dark-text-secondary">{body}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        {primary ? (
          <Link href={primary.href} className="btn-on-dark">
            {primary.label} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {secondary ? (
          <Link href={secondary.href} className="btn border border-dark-border-subtle text-dark-text-primary hover:bg-white/5">
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Terminology / "good to know" aside inside educational copy. */
export function Callout({ title, children }) {
  return (
    <aside className="my-8 rounded-2xl border border-border-subtle bg-white/55 p-5">
      {title ? <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-text-secondary">{title}</p> : null}
      <div className="mt-2 text-[15px] leading-[1.7] text-text-primary">{children}</div>
    </aside>
  );
}

/** A labelled group of descriptive text links (internal linking). */
export function LinkList({ title, links }) {
  return (
    <div>
      {title ? <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{title}</p> : null}
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-link text-[15px]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
