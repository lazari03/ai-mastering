import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Keyed by uid once requireAuth has run (accurate per-account limiting,
// not punishing everyone behind the same office/NAT IP) — falls back to IP
// for anything before auth runs (health checks aren't limited at all, see
// server.js, so this mostly matters for the pre-auth 401 case itself).
// ipKeyGenerator (not raw req.ip) is required for the fallback — a plain
// req.ip lets an IPv6 client cycle through its own /64 subnet to get a
// "new" key on every request and bypass the limit entirely; the helper
// normalizes to the subnet instead of the individual address.
function keyByUidOrIp(req) {
  return req.user?.uid || ipKeyGenerator(req.ip);
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
