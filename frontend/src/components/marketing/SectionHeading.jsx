// Repeated identically at the top of every marketing section (eyebrow +
// title, sometimes a subtitle) — one component instead of 8 copies of the
// same three lines, and the one place to evolve that visual language.
export default function SectionHeading({ eyebrow, title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <p className="m-0 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-text-secondary">
        <span className="h-px w-5 bg-accent" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.08] tracking-tight text-text-primary sm:text-[44px]">
        {title}
      </h2>
      {subtitle ? <p className="mt-3 max-w-xl text-base leading-relaxed text-text-secondary">{subtitle}</p> : null}
    </div>
  );
}
