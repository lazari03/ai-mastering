import { getAuth } from "../config/firebase.js";
import { settings } from "../config/settings.js";

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
    // checkRevoked:true costs one extra Firebase Auth lookup per request
    // but is what actually makes "sign out of all devices" (revokeRefreshTokens,
    // see authRoutes.js) and password-change invalidation work — without
    // it, a token minted before the revocation keeps passing verification
    // right up until its own 1h expiry, silent-refresh or not.
    const decoded = await auth.verifyIdToken(token, true);

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

    req.user = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (error) {
    // Covers expired token, malformed token, wrong project, revoked token.
    const revoked = error?.code === "auth/id-token-revoked";
    return res.status(401).json({
      detail: revoked ? "Your session was revoked — please sign in again." : `Invalid or expired token: ${error.message}`,
      code: revoked ? "SESSION_EXPIRED" : "INVALID_TOKEN",
    });
  }
}
