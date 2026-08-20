// Pure CSS (Tailwind's built-in animate-spin) — no new dependency, no JS
// animation loop to worry about (see Threads.jsx's TBT saga for why that
// matters). One ring element, brass-colored to match the rest of the app.
export function Spinner({ size = 16, className = "" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-brass/25 border-t-brass ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Centered spinner + label, for full-panel/full-page loading states
// ("Loading…" text alone, with nothing else on screen).
export function LoadingBlock({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 py-6 text-sm text-zinc-400 ${className}`}>
      <Spinner size={18} />
      <span>{label}</span>
    </div>
  );
}
