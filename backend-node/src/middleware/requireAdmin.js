import { getFirestore } from "../config/firebase.js";

// Mounted AFTER requireAuth (server.js's global auth gate runs first for
// any path not on its bypass list — see server.js — and /analytics/admin
// is not on that list, so req.user is always already a verified Firebase
// identity by the time this runs). This is the one additional check on
// top of that: does this uid's own Firestore user doc say role === "admin".
//
// Deliberately NOT a Firebase custom claim — that needs a one-off Admin
// SDK script to set, which is more moving parts than "smallest clean
// authorization model" calls for here. A single field on the same
// users/{uid} doc every other route already reads (see profileService.js,
// entitlementsService.js) is the whole mechanism: grant admin by setting
// that field by hand in the Firestore console, revoke by clearing it.
//
// No frontend state is ever trusted for this decision — every
// /analytics/admin/* route runs this middleware itself, so even a page
// that somehow rendered without checking admin status server-side would
// still get a 403 the moment it tried to fetch real data.
export async function requireAdmin(req, res, next) {
  try {
    if (req.user?.isAnonymous) {
      return res.status(403).json({ detail: "Admin access requires a real account." });
    }
    const snap = await getFirestore().collection("users").doc(req.user.uid).get();
    if (snap.data()?.role !== "admin") {
      return res.status(403).json({ detail: "You do not have access to this resource." });
    }
    return next();
  } catch (error) {
    console.error("requireAdmin check failed:", error.message);
    return res.status(500).json({ detail: "Could not verify admin access." });
  }
}
