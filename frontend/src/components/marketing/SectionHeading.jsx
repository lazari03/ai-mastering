// Repeated identically at the top of every marketing section (eyebrow +
// title, sometimes a subtitle) — one component instead of 8 copies of the
// same three lines, and the one place to evolve that visual language.
export default function SectionHeading({ eyebrow, title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-brass">
        <span className="h-px w-5 bg-ember" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="mt-3 font-[var(--font-title)] text-[28px] leading-[1.1] tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">{subtitle}</p> : null}
    </div>
  );
}
