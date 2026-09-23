// Repeated identically at the top of every marketing section (eyebrow +
// title, sometimes a subtitle) — one component instead of 8 copies of the
// same three lines, and the one place to evolve that visual language.
//
// The eyebrow is a pill-shaped badge rather than a dash followed by
// text: at 10px it needs an enclosure to register as a deliberate label
// instead of as a stray caption. Titles run to 64px with negative
// tracking and text-balance so a heading never leaves one orphaned word
// on its own last line.
export default function SectionHeading({ eyebrow, title, subtitle, className = "" }) {
  return (
    <div className={className}>
      {eyebrow ? (
        <p className="eyebrow m-0">{eyebrow}</p>
      ) : null}
      <h2
        className="mt-5 max-w-3xl font-[var(--font-title)] text-[38px] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary sm:text-[52px] lg:text-[64px]"
        style={{ textWrap: "balance" }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-5 max-w-[58ch] text-[17px] leading-[1.6] text-text-secondary" style={{ textWrap: "pretty" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
