// Maps an error thrown while proxying to the Python service into the
// status + JSON body a browser should see. Upstream 4xx details are written
// for users (validation, unreadable audio) and pass through; anything that
// is a server-side failure (Python 5xx, a gateway bug, an unreachable
// upstream) gets a generic message so internal URLs, stderr and stack
// details stay in the server log only. `code` is always carried so the
// frontend can localize (frontend/src/lib/masteringErrors.js).

// Retryable / semantically distinct upstream statuses the frontend relies on.
const PASSTHROUGH_STATUSES = new Set([409, 413, 415, 499, 503, 504]);

export const GENERIC_SERVER_DETAIL = "Something went wrong on our side. Please try again.";

export function toClientError(error, { fallbackDetail = GENERIC_SERVER_DETAIL } = {}) {
  const upstream = Number(error?.status);
  const code = error?.code || null;
  if (PASSTHROUGH_STATUSES.has(upstream)) {
    return { status: upstream, body: { code, detail: error?.message || fallbackDetail } };
  }
  if (upstream >= 400 && upstream < 500) {
    return { status: 400, body: { code, detail: error?.message || fallbackDetail } };
  }
  // Python 5xx → 502 (bad gateway); no status at all → an unexpected
  // gateway-side failure → 500. Neither leaks its message.
  return { status: upstream >= 500 ? 502 : 500, body: { code, detail: fallbackDetail } };
}

// Thrown when the Python service can't be reached at all (connection
// refused, DNS, reset). The message deliberately contains "network" so
// analyticsService.normalizeMasteringFailure() buckets it as network_error.
export class UpstreamUnavailableError extends Error {
  constructor() {
    super("The mastering service is temporarily unavailable (network error). Please try again in a minute.");
    this.name = "UpstreamUnavailableError";
    this.status = 503;
    this.code = "service_unavailable";
  }
}
