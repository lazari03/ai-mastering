import { getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";

// Top-level collection, not per-user — a newsletter subscriber usually
// isn't a signed-in account at all (this widget is meant to work for an
// anonymous homepage visitor). Doc ID is the normalized email itself, so
// a repeat signup is naturally idempotent (overwrite, not a duplicate
// doc) instead of needing a query-then-check.
function subscribersCollection() {
  return getFirestore().collection("newsletterSubscribers");
}

export async function subscribeToNewsletter(email, source) {
  const normalized = String(email || "").trim().toLowerCase();
  const ref = subscribersCollection().doc(normalized);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      email: normalized,
      source: source || "unknown",
      subscribedAt: new Date(),
    });
  }
  // Same code for everyone who signs up — see settings.js's
  // newsletterDiscountCode comment for why this isn't a unique code per
  // subscriber.
  return { discountCode: settings.newsletterDiscountCode, alreadySubscribed: existing.exists };
}
