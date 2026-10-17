import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Keyed by uid when req.user is set (per-account limiting, not punishing
// everyone behind the same office/NAT IP), else by IP. NOTE: generalLimiter
// is mounted in server.js BEFORE requireAuth, so req.user is never set yet
// and it is effectively IP-keyed. Limiters applied per-route (after auth),
// e.g. expensiveLimiter and previewParamsLimiter, really are uid-keyed.
// ipKeyGenerator (not raw req.ip) is required for the fallback — a plain
// req.ip lets an IPv6 client cycle through its own /64 subnet to get a
// "new" key on every request and bypass the limit entirely; the helper
// normalizes to the subnet instead of the individual address.
function keyByUidOrIp(req) {
  return req.user?.uid || ipKeyGenerator(req.clientIp || req.ip);
}

// Blunts basic request floods across the whole API — generous enough that
// normal usage (catalog fetches, entitlement checks on every tab switch,
// polling) never comes close. Not the real protection for expensive
// routes, just a floor under everything.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUidOrIp,
  message: { detail: "Too many requests — slow down and try again shortly." },
});

// The real protection: /master, /analyze-chords, /codec-preview all run
// genuine DSP compute (seconds to over a minute of CPU each) — without a
// cap here, one account (or one stolen token) can run the server's compute
// budget to zero regardless of what their plan quota otherwise allows, or
// just rack up real cost before the monthly quota even has a chance to
// kick in for that request. 20 renders per 15 minutes is well above any
// legitimate human workflow but far below what a script could otherwise do.
export const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUidOrIp,
  message: { detail: "Too many render requests — wait a few minutes before trying again." },
});

// POST /preview-params fires on knob/chip changes (cheap-ish Python call, but
// forwards a large analysis JSON). 120 per 5 min = 1 every 2.5 s sustained,
// above any realistic human knob dragging (the client debounces).
export const previewParamsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUidOrIp,
  message: { detail: "Too many preview updates — wait a moment and try again.", code: "rate_limited" },
});

// Legacy shared-secret /admin/presets/* routes. IP-keyed and counts ONLY
// failed attempts (skipSuccessfulRequests: responses < 400 are not counted),
// so a legitimate admin is never throttled but key guessing is.
export const adminKeyFailureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  message: { detail: "Too many failed admin attempts — try again later.", code: "rate_limited" },
});

// First-party analytics ingestion (/analytics/collect) — public and
// anonymous by design (most page views happen before any Firebase
// interaction at all, see analyticsRoutes.js), so this is the one route
// that can never key by uid. IP-only, generous enough for a real visitor's
// batched heartbeat/event traffic across a normal session, but low enough
// to block a script from turning this into an unbounded write sink (see
// SECURITY notes in analyticsService.js for the payload-shape validation
// that does the rest of that job).
export const analyticsCollectLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  message: { detail: "Too many analytics requests." },
});

// Anonymous newsletter signup — IP-keyed (no account yet). Each call can hit
// Firestore, the email-deliverability check and Brevo, so it gets a far
// tighter budget than the general floor.
export const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  message: { detail: "Too many signup attempts — try again in a few minutes.", code: "rate_limited" },
});

// Public share-link endpoints (/shared/*) — no account, so IP-keyed.
// Tokens are 256-bit random values, so this isn't what stops guessing
// (that's computationally impossible regardless); it caps how hard one
// client can hammer the info/download endpoints, e.g. a leaked link
// posted somewhere public being scraped in a loop.
export const shareAccessLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
  message: { detail: "Too many requests for shared files — try again in a few minutes.", code: "rate_limited" },
});
