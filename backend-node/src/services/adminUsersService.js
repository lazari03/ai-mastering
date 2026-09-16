import { getAuth, getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";
import { isEntitled } from "./polarService.js";
import { sendPasswordResetEmail } from "./brevoService.js";

// Firebase Auth is the source of truth for "who is a registered user" (the
// user's own requirement: "the users must be the same as in firebase") —
// Firestore's users/{uid} doc only ever holds the extra profile/plan
// fields Auth itself has no room for. Every function here starts from
// Auth and merges Firestore data in, never the other way around, so a
// user who exists in Auth but never finished onboarding (no Firestore doc
// yet) still shows up.

function planFromSubscription(sub) {
  if (!isEntitled(sub)) return "free";
  if (sub.productId && sub.productId === settings.polarProducts.planPro) return "pro";
  if (sub.productId && sub.productId === settings.polarProducts.planStudio) return "studio";
  return "free";
}

function mergeUserRecord(userRecord, profileData) {
  const data = profileData || {};
  return {
    uid: userRecord.uid,
    email: userRecord.email || data.email || null,
    displayName: userRecord.displayName || null,
    disabled: Boolean(userRecord.disabled),
    emailVerified: Boolean(userRecord.emailVerified),
    creationTime: userRecord.metadata?.creationTime || null,
    lastSignInTime: userRecord.metadata?.lastSignInTime || null,
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    phone: data.phone || "",
    studioName: data.studioName || "",
    role: data.role || null,
    plan: planFromSubscription(data.subscription),
    subscription: data.subscription || null,
    chordSubscription: data.chordSubscription || null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
  };
}

// pageToken: Firebase Auth's own listUsers cursor, passed straight through
// — same {items, nextCursor}-style shape every other admin list endpoint
// in this app already returns (see analyticsQueryService.js's
// listSessions), just named nextPageToken to match what it actually is.
//
// search: an admin convenience filter, not a database index — Firebase
// Auth has no server-side substring search over email. A full email gets
// an exact, cheap getUserByEmail() lookup; anything else fetches and
// filters in memory, capped at a few thousand users (MAX_SEARCH_SCAN)
// since this is an internal tool, not a customer-facing search box.
const MAX_SEARCH_SCAN = 5000;

export async function listUsers({ pageToken, search } = {}) {
  const auth = getAuth();

  if (search && search.includes("@") && !search.includes(" ")) {
    try {
      const userRecord = await auth.getUserByEmail(search.trim().toLowerCase());
      const doc = await getFirestore().collection("users").doc(userRecord.uid).get();
      return { users: [mergeUserRecord(userRecord, doc.data())], nextPageToken: null };
    } catch (error) {
      if (error?.code === "auth/user-not-found") return { users: [], nextPageToken: null };
      throw error;
    }
  }

  let userRecords = [];
  let nextPageToken = null;
  if (search) {
    // Scan (bounded) for a partial-email match — no pageToken passthrough
    // while searching, since this already walks every page itself.
    let token;
    const needle = search.trim().toLowerCase();
    do {
      const page = await auth.listUsers(1000, token);
      userRecords.push(...page.users.filter((u) => (u.email || "").toLowerCase().includes(needle)));
      token = page.pageToken;
    } while (token && userRecords.length < 200 && userRecords.length + 1000 <= MAX_SEARCH_SCAN);
  } else {
    const page = await auth.listUsers(1000, pageToken || undefined);
    userRecords = page.users;
    nextPageToken = page.pageToken || null;
  }

  if (userRecords.length === 0) return { users: [], nextPageToken };

  const db = getFirestore();
  const docRefs = userRecords.map((u) => db.collection("users").doc(u.uid));
  const docs = await db.getAll(...docRefs);
  const dataByUid = new Map(docs.map((d) => [d.id, d.data()]));

  const users = userRecords
    .map((u) => mergeUserRecord(u, dataByUid.get(u.uid)))
    .sort((a, b) => new Date(b.creationTime || 0) - new Date(a.creationTime || 0));

  return { users, nextPageToken };
}

export async function getUserDetail(uid) {
  const auth = getAuth();
  const [userRecord, doc] = await Promise.all([auth.getUser(uid), getFirestore().collection("users").doc(uid).get()]);
  return mergeUserRecord(userRecord, doc.data());
}

// Generates the reset link via the Admin SDK, then actually delivers it —
// "send them a reset password link" means the user receives it, not that
// the admin gets a URL to copy/paste. Reuses the same Brevo transactional
// integration the welcome email already goes through.
export async function sendPasswordReset(uid) {
  const auth = getAuth();
  const userRecord = await auth.getUser(uid);
  if (!userRecord.email) {
    throw new Error("This account has no email address on file — can't send a reset link.");
  }
  const resetLink = await auth.generatePasswordResetLink(userRecord.email);
  const doc = await getFirestore().collection("users").doc(uid).get();
  await sendPasswordResetEmail(userRecord.email, doc.data()?.firstName, resetLink);
  return { ok: true };
}

export async function setUserDisabled(uid, disabled) {
  const auth = getAuth();
  await auth.updateUser(uid, { disabled: Boolean(disabled) });
  // A disabled account's existing sessions should end immediately, not
  // linger until their token naturally expires — same principle as
  // "sign out of all devices" elsewhere in this app.
  if (disabled) {
    await auth.revokeRefreshTokens(uid).catch((error) => console.error("Failed to revoke tokens for disabled user (non-fatal):", error.message));
  }
  return { ok: true, disabled: Boolean(disabled) };
}
