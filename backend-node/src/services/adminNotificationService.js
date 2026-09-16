import { getFirestore } from "../config/firebase.js";

// Purpose-built admin-UI notification log with read/unread state — distinct
// from polarService.js's purchaseEvents collection (an unrelated append-
// only analytics record with no read state, no registration events, and
// consumers elsewhere in the codebase whose shape this must not disturb).
// One doc per event: { type, message, uid, email, amountCents, currency,
// createdAt, readAt }. readAt: null means unread.

function notificationsCollection() {
  return getFirestore().collection("adminNotifications");
}

// Best-effort, wrapped internally exactly like notifyNewRegistration/
// notifyPurchase (telegramService.js) — a Firestore write failure here
// must never surface to the signup/webhook flow that triggered it.
export async function writeNotification({ type, message, uid = null, email = null, amountCents = null, currency = null }) {
  try {
    await notificationsCollection().add({
      type,
      message,
      uid,
      email,
      amountCents,
      currency,
      createdAt: new Date(),
      readAt: null,
    });
  } catch (error) {
    console.error(`Failed to write admin notification (non-fatal, type=${type}):`, error.message);
  }
}

function serialize(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    readAt: data.readAt?.toDate?.()?.toISOString?.() || null,
  };
}

export async function listNotifications({ limit = 20, cursor } = {}) {
  let q = notificationsCollection().orderBy("createdAt", "desc").limit(Math.min(limit, 100));
  if (cursor) {
    const cursorSnap = await notificationsCollection().doc(cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }
  const snap = await q.get();
  return {
    notifications: snap.docs.map(serialize),
    nextCursor: snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null,
  };
}

export async function getUnreadCount() {
  const snap = await notificationsCollection().where("readAt", "==", null).count().get();
  return snap.data().count;
}

export async function markRead(id) {
  await notificationsCollection().doc(id).set({ readAt: new Date() }, { merge: true });
  return { ok: true };
}

export async function markAllRead() {
  const snap = await notificationsCollection().where("readAt", "==", null).limit(500).get();
  if (snap.empty) return { ok: true, updated: 0 };
  const batch = getFirestore().batch();
  const now = new Date();
  snap.docs.forEach((doc) => batch.set(doc.ref, { readAt: now }, { merge: true }));
  await batch.commit();
  return { ok: true, updated: snap.docs.length };
}
