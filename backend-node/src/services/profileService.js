import { getFirestore } from "../config/firebase.js";

// User profile lives in Firestore at users/{uid} — the same document whose
// "artists" subcollection holds Saved Artists (see customPresetsService.js)
// and "jobs" subcollection holds mastering job history (see jobsService.js).
// Firebase Auth itself only ever holds email/password + optional
// displayName; the extra registration fields the signup form collects
// (first/last name, phone, studio name, terms acceptance) have nowhere
// else to live.
function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

export async function saveProfile(uid, profile) {
  if (!uid) {
    throw new Error("Profile requires a signed-in user");
  }
  const record = {};
  // Only ever set fields that were actually passed — this is called both
  // at signup (termsAcceptedAt/termsVersion, no studioName yet) and later
  // from Settings (firstName/lastName/phone/studioName, never terms
  // fields again). Unconditionally including termsAcceptedAt here with a
  // "now" fallback would silently overwrite the original consent
  // timestamp every time a user edits their profile.
  if (profile.firstName !== undefined) record.firstName = profile.firstName || "";
  if (profile.lastName !== undefined) record.lastName = profile.lastName || "";
  if (profile.phone !== undefined) record.phone = profile.phone || "";
  if (profile.studioName !== undefined) record.studioName = profile.studioName || "";
  if (profile.termsAcceptedAt !== undefined) record.termsAcceptedAt = new Date(profile.termsAcceptedAt);
  if (profile.termsVersion !== undefined) record.termsVersion = profile.termsVersion;
  // Set once, right after the first-time onboarding tour finishes (or is
  // skipped) — never unset, so the tour never comes back for that account.
  if (profile.tutorialShown !== undefined) record.tutorialShown = Boolean(profile.tutorialShown);

  await userDoc(uid).set(record, { merge: true });
  return record;
}

export async function getProfile(uid) {
  if (!uid) {
    throw new Error("Profile requires a signed-in user");
  }
  const doc = await userDoc(uid).get();
  const data = doc.data() || {};
  return {
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    phone: data.phone || "",
    studioName: data.studioName || "",
    tutorialShown: Boolean(data.tutorialShown),
  };
}

async function deleteSubcollection(docRef, name) {
  const snapshot = await docRef.collection(name).get();
  if (snapshot.empty) return;
  const batch = getFirestore().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

// Deletes everything this app stored in Firestore for a user: the profile
// doc itself plus its "artists" (Saved Artists) and "jobs" (render
// history) subcollections — Firestore doesn't cascade-delete
// subcollections when you delete a parent doc, so each needs an explicit
// pass. Does NOT touch the Firebase Auth account itself — the caller
// (DELETE /account) deletes that separately, client-side, after this
// succeeds, since only the signed-in user's own client can re-authenticate
// and delete their own Auth record.
export async function deleteAllUserData(uid) {
  if (!uid) {
    throw new Error("Account deletion requires a signed-in user");
  }
  const doc = userDoc(uid);
  await deleteSubcollection(doc, "artists");
  await deleteSubcollection(doc, "jobs");
  await doc.delete();
}
