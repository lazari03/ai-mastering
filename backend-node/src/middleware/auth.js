import { getAuth } from "../config/firebase.js";

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
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    return next();
  } catch (error) {
    // Covers expired token, malformed token, wrong project, revoked token.
    return res.status(401).json({ detail: `Invalid or expired token: ${error.message}` });
  }
}
