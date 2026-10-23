import Link from "next/link";

// One component for every non-happy-path state: empty library, failed
// upload/analysis/mastering/payment, unsupported file, 404, server error.
// Always says what happened and offers a way forward.
//
// tone: "neutral" (empty/informational) | "error" | "success"
const ICONS = {
  neutral: (
    <path d="M4 12h3l2-6 4 12 2-6h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5.5M12 16.2v.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  success: <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
};

export default function StatePanel({ tone = "neutral", eyebrow, title, body, actions = [], children, headingLevel = 2, compact = false }) {
  const Heading = `h${headingLevel}`;
  return (
    <div className={`mx-auto flex max-w-[520px] flex-col items-center text-center ${compact ? "py-8" : "py-16"}`} role={tone === "error" ? "alert" : undefined}>
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 items-center justify-center rounded-full border ${
          tone === "error" ? "border-red-600/25 bg-red-600/[0.06] text-red-700" : "border-border-subtle bg-white/60 text-text-primary"
        }`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22">
          {ICONS[tone] || ICONS.neutral}
        </svg>
      </span>
      {eyebrow ? <p className="eyebrow m-0 mt-6">{eyebrow}</p> : null}
      <Heading className={`${eyebrow ? "mt-3" : "mt-6"} font-[var(--font-title)] text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text-primary`}>
        {title}
      </Heading>
      {body ? <p className="mt-3 text-[15px] leading-[1.7] text-text-secondary">{body}</p> : null}
      {children}
      {actions.length ? (
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {actions.map((a, i) =>
            a.href ? (
              <Link key={a.label} href={a.href} className={i === 0 ? "btn-primary" : "btn-secondary"}>
                {a.label}
              </Link>
            ) : (
              <button key={a.label} type="button" onClick={a.onClick} className={i === 0 ? "btn-primary" : "btn-secondary"}>
                {a.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
