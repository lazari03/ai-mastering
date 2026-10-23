import crypto from "node:crypto";

// ---------------------------------------------------------------------
// Meta Conversions API (CAPI) — the server-side twin of the browser Pixel
// (frontend/src/lib/metaPixel.js). Every browser event that has a CAPI twin
// carries the same event_id on both sides, which is what Meta uses to
// deduplicate them. Purchase is server-only (fired from the Polar webhook).
//
// Hard rules (DECISIONS.md D-007):
//   * personal data (hashed email/uid, IP, UA, fbp/fbc) only for visitors
//     whose consent is "accepted" — the callers check. The one exception is
//     the anonymous Purchase (metaConversionsService.sendPurchaseToMeta),
//     which carries no personal data at all;
//   * email and uid are SHA-256 hashed per Meta's normalization spec;
//   * fire-and-forget: a 3 s timeout, every error caught and logged, never
//     thrown into the caller (signup, mastering, checkout, webhooks);
//   * a no-op when META_PIXEL_ID / META_CAPI_TOKEN are unset.
// ---------------------------------------------------------------------

// https://developers.facebook.com/docs/graph-api/changelog — v26.0 was the
// current version on 2026-10-22. Bump deliberately; Meta routes calls on an
// expired version to the next available one rather than failing.
export const META_GRAPH_API_VERSION = "v26.0";
const REQUEST_TIMEOUT_MS = 3000;

// Read at call time (not import time) so tests and a restarted container
// both see the current environment.
export function metaCapiConfig() {
  const pixelId = (process.env.META_PIXEL_ID || "").trim();
  const token = (process.env.META_CAPI_TOKEN || "").trim();
  const testEventCode = (process.env.META_TEST_EVENT_CODE || "").trim();
  return { enabled: Boolean(pixelId && token), pixelId, token, testEventCode: testEventCode || null };
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Meta: lowercase, trim, then SHA-256. Returns null for anything that
// isn't plausibly an email, so garbage never becomes a "hashed email".
export function hashEmail(email) {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return sha256(normalized);
}

export function hashExternalId(uid) {
  if (typeof uid !== "string" || !uid.trim()) return null;
  return sha256(uid.trim());
}

// _fbp / _fbc have a fixed shape (fb.<subdomainIndex>.<ms>.<value>); anything
// else is dropped rather than forwarded.
const FB_COOKIE_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]{1,240}$/;
export function cleanFbCookie(value) {
  return typeof value === "string" && FB_COOKIE_RE.test(value.trim()) ? value.trim() : null;
}

const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
export function cleanEventId(value) {
  return typeof value === "string" && EVENT_ID_RE.test(value) ? value : null;
}

// anonymousId: a random value the caller generates and discards (the
// anonymous Purchase) — the only identifier sent when there is no consent.
export function buildUserData({ email, uid, ip, userAgent, fbp, fbc, anonymousId } = {}) {
  const userData = {};
  if (anonymousId) return { external_id: [sha256(String(anonymousId))] };
  const em = hashEmail(email);
  if (em) userData.em = [em];
  const externalId = hashExternalId(uid);
  if (externalId) userData.external_id = [externalId];
  if (typeof ip === "string" && ip) userData.client_ip_address = ip;
  if (typeof userAgent === "string" && userAgent) userData.client_user_agent = userAgent.slice(0, 512);
  const cleanFbp = cleanFbCookie(fbp);
  if (cleanFbp) userData.fbp = cleanFbp;
  const cleanFbc = cleanFbCookie(fbc);
  if (cleanFbc) userData.fbc = cleanFbc;
  return userData;
}

export function buildEventPayload({ eventName, eventId, eventTime, eventSourceUrl, actionSource = "website", user, customData }, { testEventCode } = {}) {
  const event = {
    event_name: eventName,
    event_time: Math.floor((eventTime instanceof Date ? eventTime.getTime() : Number(eventTime) || Date.now()) / 1000),
    action_source: actionSource,
    user_data: buildUserData(user),
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length) event.custom_data = customData;
  const payload = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

// Test seam: swap the network call.
let fetchImpl = (...args) => globalThis.fetch(...args);
export function _setFetchForTests(fn) {
  fetchImpl = fn || ((...args) => globalThis.fetch(...args));
}

/**
 * Sends one event. Always resolves (true = Meta accepted it, false = skipped
 * or failed); never rejects.
 */
export async function sendMetaEvent(event) {
  try {
    const config = metaCapiConfig();
    if (!config.enabled || !event?.eventName) return false;
    const payload = buildEventPayload(event, config);
    const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.token)}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Meta CAPI ${event.eventName} rejected (${response.status}, non-fatal):`, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Meta CAPI ${event?.eventName} failed (non-fatal):`, error?.message || error);
    return false;
  }
}
