// Inline error/notice used inside panels and forms — one look for every
// "something went wrong here" message, announced to screen readers, with an
// optional recovery action next to the text.
export default function InlineAlert({ children, action, tone = "error", size = "sm", className = "" }) {
  const tones = {
    error: "border-red-600/25 bg-red-600/[0.05] text-red-800",
    info: "border-accent/25 bg-accent/[0.07] text-text-primary",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 ${size === "xs" ? "text-xs" : "text-sm"} leading-relaxed ${tones[tone]} ${className}`}
    >
      <span className="min-w-0">{children}</span>
      {action ? (
        <button type="button" onClick={action.onClick} className="btn-secondary btn-sm shrink-0 bg-white/70">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
