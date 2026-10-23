import crypto from "node:crypto";

import { settings } from "../config/settings.js";
import { getFirestore as getRealFirestore } from "../config/firebase.js";
import { sendMetaEvent, cleanEventId, cleanFbCookie } from "./metaCapiService.js";

// ---------------------------------------------------------------------
// Which of our events reach Meta, and under what conditions. The browser
// mirror of this mapping lives in frontend/src/lib/analytics.js; THIS one is
// the boundary (a client can send anything to /analytics/collect).
//
//   pricing_view      -> ViewContent           Pixel + CAPI
//   signup_completed  -> CompleteRegistration  Pixel + CAPI
//   master_completed  -> FirstMasterCompleted  Pixel + CAPI, first real master only,
//                                              verified against users/{uid}.firstMasterJobId
//   begin_checkout    -> InitiateCheckout      Pixel + CAPI
//   Polar paid        -> Purchase              CAPI only (sendPurchaseToMeta)
//
// Nothing about a visitor is sent unless their consent is "accepted"
// (DECISIONS D-007, D-008). The single exception is the anonymous Purchase:
// a sale by someone who did not accept is still counted, with no data about
// them at all.
// ---------------------------------------------------------------------

export const COLLECT_TO_META = {
  pricing_view: "ViewContent",
  signup_completed: "CompleteRegistration",
  master_completed: "FirstMasterCompleted",
  begin_checkout: "InitiateCheckout",
};

const DEFAULT_SITE_ORIGIN = "https://auralithforge.app";
function siteOrigin() {
  return (settings.frontendOrigin || process.env.FRONTEND_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");
}

let firestoreOverride = null;
export function _setDepsForTests({ db = null } = {}) {
  firestoreOverride = db;
}
function db() {
  return firestoreOverride || getRealFirestore();
}
function userRef(uid) {
  return db().collection("users").doc(uid);
}

function cleanUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Query strings can carry tokens (see analyticsService.sanitizePath);
    // Meta only needs the page.
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function customDataFor(name, props = {}) {
  if (name === "pricing_view") return { content_name: "pricing", content_category: typeof props.source === "string" ? props.source.slice(0, 60) : "pricing" };
  if (name === "signup_completed") return { status: "completed", ...(typeof props.method === "string" ? { registration_method: props.method.slice(0, 30) } : {}) };
  if (name === "begin_checkout") {
    const value = Number(props.value);
    return { value: Number.isFinite(value) && value >= 0 && value < 10000 ? value : 0, currency: "EUR" };
  }
  if (name === "master_completed") return typeof props.tier === "string" ? { tier: props.tier.slice(0, 30) } : {};
  return {};
}

// FirstMasterCompleted is the ad-optimization event, so the client's word
// is not enough: the job it names must be the one the /master route
// recorded as this user's first (claimFirstMaster below).
async function isVerifiedFirstMaster(uid, props) {
  if (!uid || props?.first_master !== true || typeof props.job_id !== "string") return false;
  const data = (await userRef(uid).get()).data() || {};
  return data.firstMasterQualified === true && data.firstMasterJobId === props.job_id;
}

/**
 * Forwards the mapped events of one /analytics/collect batch to CAPI.
 * Returns the number of events sent; never throws. The route does not
 * await it.
 */
export async function forwardCollectEventsToMeta({ events, meta, uid = null, email = null, ip = null, userAgent = null }) {
  try {
    if (meta?.consent !== "accepted" || !Array.isArray(events)) return 0;
    let sent = 0;
    for (const evt of events.slice(0, 25)) {
      const eventName = evt && COLLECT_TO_META[evt.name];
      const eventId = cleanEventId(evt?.meta?.eventId);
      if (!eventName || !eventId) continue;
      if (evt.name === "master_completed" && !(await isVerifiedFirstMaster(uid, evt.props))) continue;
      const ok = await sendMetaEvent({
        eventName,
        eventId,
        eventTime: Number.isFinite(evt.ts) ? evt.ts : Date.now(),
        eventSourceUrl: cleanUrl(evt.meta.url) || siteOrigin(),
        actionSource: "website",
        user: { email, uid, ip, userAgent, fbp: meta.fbp, fbc: meta.fbc },
        customData: customDataFor(evt.name, evt.props),
      });
      if (ok) sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("Meta CAPI forwarding failed (non-fatal):", error?.message || error);
    return 0;
  }
}

/**
 * Decides, once and server-side, whether this completed real master is the
 * user's first. The first call per user writes firstMasterAt/JobId; every
 * later call returns false. Users who mastered before this field existed
 * (priorMasters > 0, or a Free counter already past 1) get the field written
 * but are not "qualified", so they never fire the event.
 */
export async function claimFirstMaster(uid, jobId, { priorMasters = 0 } = {}) {
  if (!uid || !jobId) return false;
  const ref = userRef(uid);
  return db().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    if (data.firstMasterAt) return false;
    const freeUsed = Number(data.freeMasterUsage?.used || 0);
    const qualified = priorMasters === 0 && freeUsed <= 1;
    tx.set(ref, { firstMasterAt: new Date(), firstMasterJobId: jobId, firstMasterQualified: qualified }, { merge: true });
    return qualified;
  });
}

/**
 * Stores what the Purchase webhook will need (it has no browser in the
 * loop). Without consent, any earlier identifiers are wiped instead.
 */
export async function persistMetaAttribution(uid, { consent, fbp, fbc, ip, userAgent } = {}) {
  if (!uid) return;
  try {
    const record =
      consent === "accepted"
        ? {
            consent: "accepted",
            fbp: cleanFbCookie(fbp),
            fbc: cleanFbCookie(fbc),
            ip: typeof ip === "string" ? ip.slice(0, 64) : null,
            userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null,
            updatedAt: new Date(),
          }
        : { consent: consent === "declined" ? "declined" : "unknown", fbp: null, fbc: null, ip: null, userAgent: null, updatedAt: new Date() };
    await userRef(uid).set({ metaAttribution: record }, { merge: true });
  } catch (error) {
    console.error("Persisting Meta attribution failed (non-fatal):", error?.message || error);
  }
}

/**
 * Server-only Purchase, sent for every paid order/subscription.
 *
 * Consent "accepted" (stored at checkout): attributed — hashed email/uid,
 * IP, UA, fbp/fbc — with event_id purchase_<polar id>.
 *
 * Anything else (declined, never chose, no checkout record): ANONYMOUS. The
 * sale is still counted, as amount + currency + product only, with no
 * information about the buyer: no IP, UA, cookies, email, uid or order id.
 * Meta rejects events without a customer-information field, so the only
 * one sent is external_id = SHA-256 of a random UUID generated here and
 * never stored — nobody (us included) can link it back to the buyer,
 * which keeps the payload outside GDPR's "personal data". Meta cannot
 * attribute it to an ad; it only shows up as revenue in Events Manager.
 *
 * Either way the metaPurchases/purchase_<polar id> marker (written in a
 * transaction) means a webhook retry never sends a second one.
 */
export async function sendPurchaseToMeta({ uid, polarId, amountCents, currency, email = null, contentName = null }) {
  try {
    if (!polarId) return false;
    const markerId = `purchase_${polarId}`;
    const user = uid ? (await userRef(uid).get()).data() || {} : {};
    const attribution = user.metaAttribution;
    const consented = Boolean(uid) && attribution?.consent === "accepted";
    const markerRef = db().collection("metaPurchases").doc(markerId);
    const first = await db().runTransaction(async (tx) => {
      if ((await tx.get(markerRef)).exists) return false;
      // The anonymous path keeps no uid either.
      tx.set(markerRef, { ...(consented ? { uid } : {}), anonymous: !consented, at: new Date() });
      return true;
    });
    if (!first) return false;
    const customData = {
      value: Math.round(Number(amountCents) || 0) / 100,
      currency: typeof currency === "string" && currency ? currency.toUpperCase() : "EUR",
      ...(contentName ? { content_name: contentName } : {}),
    };
    if (!consented) {
      return await sendMetaEvent({
        eventName: "Purchase",
        eventId: `anon_${crypto.randomUUID()}`,
        eventTime: Date.now(),
        // "website" would require the browser's user agent.
        actionSource: "other",
        user: { anonymousId: crypto.randomUUID() },
        customData,
      });
    }
    return await sendMetaEvent({
      eventName: "Purchase",
      eventId: markerId,
      eventTime: Date.now(),
      eventSourceUrl: `${siteOrigin()}/thank-you`,
      actionSource: "website",
      user: { email: email || user.email || null, uid, ip: attribution.ip, userAgent: attribution.userAgent, fbp: attribution.fbp, fbc: attribution.fbc },
      customData,
    });
  } catch (error) {
    console.error("Meta CAPI Purchase failed (non-fatal):", error?.message || error);
    return false;
  }
}
