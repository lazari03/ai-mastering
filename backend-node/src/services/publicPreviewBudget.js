// Site-wide ceiling on signed-out previews, on top of the per-IP limiter.
// Per-IP limits don't stop a spread-out burst (many IPs, or a link going
// viral) from queueing the one Python service behind anonymous renders and
// slowing paying users' masters. When the hour's budget is spent, signed-out
// visitors are asked to create a free account instead — signed-in previews
// and masters are never affected by this.
//
// In-memory and per-process on purpose: there is one node-api container,
// and losing the window on a restart only ever errs toward allowing more.

export function createPreviewBudget({ limit, windowMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
  const stamps = [];

  function prune() {
    const cutoff = now() - windowMs;
    while (stamps.length && stamps[0] <= cutoff) stamps.shift();
  }

  return {
    // Claims one slot if available. Returns false when the budget is spent.
    tryTake() {
      if (!(limit > 0)) return false;
      prune();
      if (stamps.length >= limit) return false;
      stamps.push(now());
      return true;
    },
    // Gives back a slot for a render that never started (bad upload, etc.).
    release() {
      stamps.pop();
    },
    remaining() {
      prune();
      return Math.max(0, limit - stamps.length);
    },
  };
}

export const publicPreviewBudget = createPreviewBudget({
  limit: Number(process.env.PUBLIC_PREVIEW_HOURLY_LIMIT || 60),
});
