import crypto from "node:crypto";

import { getAuth, getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";

// The cache below is keyed by a hash of the token, never the raw token
// itself — the bearer credential never needs to sit in this process's
// memory as plaintext for longer than the single request that's actively
// using it. A hash is enough to recognize "same token as a moment ago"
// without holding anything a memory dump/crash report/debugger could hand
// over as a directly usable credential.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Only re-written when it's already stale by more than this — writing
// users/{uid}.lastActiveAt on literally every single request (catalog
// fetches, entitlement polls, etc.) would be a Firestore write per
// request for no real benefit; activity only needs minute-level
// resolution, not per-request precision.
const LAST_ACTIVE_WRITE_THROTTLE_MS = 2 * 60 * 1000;

// checkRevoked:true makes a real extra network call to Google's Identity
// Toolkit API on top of normal (local, free) signature verification — and
// this app has several client-side polling loops (heartbeats, the
// notification bell, the admin Live page, entitlements refreshes) that
// each hit an authenticated endpoint every 10-25s. Doing that extra Google
// API call on every single one of those, across every open tab, is what
// burns through a per-minute quota and turns into "RESOURCE_EXHAUSTED:
// Quota exceeded" — a transient rate-limit, not an actually-bad token —
// which the old code surfaced identically to a real invalid/expired
// token, logging people (including admins) out over a false positive.
// Caching "already confirmed not-revoked" per uid for a few minutes cuts
// that call volume by roughly this TTL divided by the polling interval,
// same throttling principle as LAST_ACTIVE_WRITE_THROTTLE_MS above — a
// real revocation (sign-out-everywhere, password change) still takes
// effect within this window, just not instantaneously.
const REVOCATION_CHECK_TTL_MS = 5 * 60 * 1000;
const revocationCheckedAt = new Map(); // uid -> last time checkRevoked actually ran

// One level up from the revocation-check throttle above: cache the WHOLE
// verified session (token signature check, session-age check, idle check,
// the Firestore lastActiveAt read) keyed by the raw token string, so a
// burst of requests carrying the identical token — which is exactly what
// heartbeats/polling/entitlement refreshes do, since the client SDK only
// mints a new ID token roughly once an hour — do zero Firebase/Firestore
// work at all while the cache entry is fresh. Only a cache miss (first
// request with a given token, or one that's gone stale) does the real
// verification. Short TTL on purpose: it's the window before "sign out of
// all devices" or a session-expiry condition actually takes effect, same
// accepted tradeoff as REVOCATION_CHECK_TTL_MS above, just tighter since
// this skips those checks entirely rather than just the revocation call.
const SESSION_CACHE_TTL_MS = 60 * 1000;
const verifiedSessionCache = new Map(); // token -> { user, cachedAt }

// Bounds memory: without this, a Map keyed by raw (large, ever-rotating)
// token strings grows forever on a long-running process. Cheap linear
// sweep on a plain setInterval — this cache is small (roughly one entry
// per active session) and cleanup doesn't need to be precise.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of verifiedSessionCache) {
    if (now - entry.cachedAt > SESSION_CACHE_TTL_MS) verifiedSessionCache.delete(key);
  }
}, SESSION_CACHE_TTL_MS).unref();

// Called wherever this app forces a session to end out-of-band —
// revokeRefreshTokens (sign-out-everywhere, disabling a user; see
// masteringRoutes.js and adminUsersService.js) — so that action takes
// effect on the very next request instead of waiting out the cache TTL
// above. Firebase's own revocation still guards the token's real cryptographic
// validity; this just makes sure our own cache doesn't paper over it for
// up to a minute.
export function invalidateCachedSession(uid) {
  for (const [key, entry] of verifiedSessionCache) {
    if (entry.user.uid === uid) verifiedSessionCache.delete(key);
  }
  revocationCheckedAt.delete(uid);
}

// Verifies the Firebase ID token in the Authorization header and attaches
// { uid, email } to req.user. Applied to every route except /health (see
// server.js) — the whole app requires a signed-in user, not just specific
// features.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ detail: "Missing or malformed Authorization header — expected 'Bearer <firebase-id-token>'" });
  }

  const tokenHash = hashToken(token);
  const cached = verifiedSessionCache.get(tokenHash);
  if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_TTL_MS) {
    req.user = cached.user;
    return next();
  }

  let auth;
  try {
    auth = getAuth();
  } catch (error) {
    // Server misconfiguration (missing/broken service account credentials)
    // — an ops problem, not something the client did wrong. Kept distinct
    // from the 401 below on purpose: a 401 here would look like "your
    // token is invalid" when the real problem is "the server isn't set
    // up," which is a much harder thing to debug from the client side.
    console.error("Firebase Admin not configured:", error.message);
    return res.status(500).json({ detail: "Auth service misconfigured on the server — see FIREBASE_SETUP.md" });
  }

  try {
    // Cheap, local signature verification first (no network call — the
    // Admin SDK caches Google's public signing certs) to get the uid, then
    // decide whether this request also needs the expensive revocation
    // check. checkRevoked:true is what actually makes "sign out of all
    // devices" (revokeRefreshTokens, see authRoutes.js) and password-change
    // invalidation work — without ever calling it, a token minted before
    // the revocation would keep passing verification right up until its
    // own 1h expiry. Only skipping how OFTEN it's called, not skipping it.
    let decoded = await auth.verifyIdToken(token, false);
    const lastChecked = revocationCheckedAt.get(decoded.uid);
    if (!lastChecked || Date.now() - lastChecked > REVOCATION_CHECK_TTL_MS) {
      decoded = await auth.verifyIdToken(token, true);
      revocationCheckedAt.set(decoded.uid, Date.now());
    }

    // auth_time is the timestamp of the original sign-in, not the last
    // silent token refresh — the client SDK refreshes the ID token forever
    // in the background, so without this check a session started once
    // never truly ends. Past the cap, the token is cryptographically valid
    // but the session itself is too old and must be re-established.
    const sessionAgeDays = (Date.now() / 1000 - decoded.auth_time) / 86400;
    if (sessionAgeDays > settings.sessionMaxAgeDays) {
      return res.status(401).json({
        detail: `Your session has expired after ${settings.sessionMaxAgeDays} days — please sign in again.`,
        code: "SESSION_EXPIRED",
      });
    }

    // Anonymous sessions (the public chord-detector's try-before-you-
    // register flow — see PublicChordDetector.jsx) skip every Firestore
    // read/write below entirely: no session-continuity promise is made
    // to a disposable pre-registration identity, and every one of these
    // is a permanent users/{uid} doc that shows up in the Firestore
    // console forever for a visitor who never converts. The uid still
    // exists in Firebase Auth (that's what makes the try-it-first flow
    // possible at all), it just never touches Firestore until the person
    // actually registers — at which point linkWithCredential upgrades
    // the SAME uid in place and this logic applies normally from then on.
    const isAnonymous = decoded.firebase?.sign_in_provider === "anonymous";

    if (!isAnonymous) {
      // Idle-session cap, independent of the absolute one above — ends a
      // session early if it just sits unused, even a young one. "Activity"
      // is "made an authenticated request" (checked here, on every one);
      // the actual timestamp write is throttled below so this doesn't cost
      // a Firestore write per request.
      const userRef = getFirestore().collection("users").doc(decoded.uid);
      const userSnap = await userRef.get();
      const lastActiveAt = userSnap.data()?.lastActiveAt?.toDate?.() || null;
      // A fresh real sign-in (auth_time just now) IS activity, even though
      // it hasn't reached the throttled Firestore write below yet — without
      // this, the very first request after any idle period longer than the
      // cap 401s and bounces the user straight back to /login, even though
      // they just legitimately re-authenticated. Found live: a returning
      // user (idle >24h) signing back in on the chord-detector auth gate
      // was immediately kicked back out on their first post-login request.
      const authTimeMs = decoded.auth_time * 1000;
      const effectiveLastActive = lastActiveAt ? Math.max(lastActiveAt.getTime(), authTimeMs) : authTimeMs;
      const idleHours = (Date.now() - effectiveLastActive) / 3600000;
      if (idleHours > settings.sessionInactivityHours) {
        return res.status(401).json({
          detail: `Your session expired after ${settings.sessionInactivityHours}h of inactivity — please sign in again.`,
          code: "SESSION_EXPIRED",
        });
      }
      const staleMs = lastActiveAt ? Date.now() - lastActiveAt.getTime() : Infinity;
      if (staleMs > LAST_ACTIVE_WRITE_THROTTLE_MS) {
        // Fire-and-forget — this must never add latency to (or fail) a
        // real request just because a bookkeeping write hiccupped.
        userRef.set({ lastActiveAt: new Date() }, { merge: true }).catch((error) => {
          console.error("Failed to record lastActiveAt:", error.message);
        });
      }
    }

    req.user = { uid: decoded.uid, email: decoded.email || null, isAnonymous, signInProvider: decoded.firebase?.sign_in_provider || null };
    verifiedSessionCache.set(tokenHash, { user: req.user, cachedAt: Date.now() });
    return next();
  } catch (error) {
    // A quota/rate-limit error from Google's own API (RESOURCE_EXHAUSTED,
    // or the transport-level UNAVAILABLE it sometimes wraps) means nothing
    // about the token itself — verification never actually completed. This
    // used to be indistinguishable from a genuinely bad token (401,
    // "invalid or expired"), which reads as "you're logged out" when the
    // real story is "try again in a moment." 503 + a distinct code lets
    // the frontend (and AdminAuthGate) tell the two apart instead of
    // signing someone out, or telling an admin they lack access, over a
    // transient rate limit.
    const message = String(error?.message || "");
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded") || message.includes("UNAVAILABLE")) {
      console.error("Auth verification hit a transient Google API error:", message);
      return res.status(503).json({
        detail: "Sign-in verification is temporarily unavailable — please try again in a moment.",
        code: "AUTH_SERVICE_UNAVAILABLE",
      });
    }
    // Covers expired token, malformed token, wrong project, revoked token.
    const revoked = error?.code === "auth/id-token-revoked";
    return res.status(401).json({
      detail: revoked ? "Your session was revoked — please sign in again." : `Invalid or expired token: ${error.message}`,
      code: revoked ? "SESSION_EXPIRED" : "INVALID_TOKEN",
    });
  }
}
