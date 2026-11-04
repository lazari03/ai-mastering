// A tool-level failure with a stable, documented machine code. Tools return
// it as an MCP result with isError: true and
//   structuredContent: { error: { code, message, retryable, ...details } }
// so ChatGPT can both explain it and decide whether retrying makes sense.
export class ToolError extends Error {
  constructor(code, message, { retryable = false, details = null } = {}) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

// Stable error codes (documented in docs/mcp/README.md). Adding codes is
// fine; renaming or repurposing one is a breaking change for clients.
export const ERROR_CODES = [
  "invalid_input",
  "insufficient_scope",
  "rate_limited",
  "upload_not_found",
  "upload_not_ready",
  "upload_rejected",
  "upload_expired",
  "too_many_pending_uploads",
  "job_not_found",
  "job_not_complete",
  "job_failed",
  "result_expired",
  "plan_required",
  "quota_exhausted",
  "too_many_active_jobs",
  "billing_unavailable",
  "server_busy",
  "internal_error",
];

// In-memory fixed-window counters keyed by OAuth subject (never IP — all
// ChatGPT traffic shares OpenAI's egress addresses). Single node-api
// instance, so process memory is the right scope; a restart resets them,
// which only ever errs toward allowing a request.
export function createRateLimiter({ windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  const sweep = setInterval(() => {
    const t = now();
    for (const [key, b] of buckets) if (t - b.start >= windowMs) buckets.delete(key);
  }, windowMs);
  sweep.unref?.();
  return {
    // true = allowed (and counted)
    hit(key, limit) {
      const t = now();
      let b = buckets.get(key);
      if (!b || t - b.start >= windowMs) {
        b = { start: t, count: 0 };
        buckets.set(key, b);
      }
      if (b.count >= limit) return false;
      b.count += 1;
      return true;
    },
    stop: () => clearInterval(sweep),
  };
}
