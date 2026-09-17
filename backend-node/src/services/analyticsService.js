import crypto from "node:crypto";
import geoip from "geoip-lite";

import { getFirestore } from "../config/firebase.js";

// ---------------------------------------------------------------------
// First-party analytics: visitors, sessions, events — all in this app's
// own Firestore (same database everything else already uses), never a
// third-party SaaS. See ANALYTICS.md-equivalent notes inline below; there
// is no separate warehouse or aggregation table (yet) — admin queries
// read analyticsEvents/analyticsSessions directly and reduce in memory,
// which is the right amount of infrastructure for this app's actual
// traffic volume (see PERFORMANCE section of the spec this implements).
// ---------------------------------------------------------------------

const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes — spec section 2
const CHECKOUT_ABANDON_MS = 30 * 60 * 1000; // spec section 8 — configurable here, one place

const MAX_EVENTS_PER_REQUEST = 25;
const MAX_PROP_KEYS = 20;
const MAX_STRING_LEN = 300;
const MAX_PATH_LEN = 300;

// Event-name allowlist — the ingestion endpoint rejects anything not in
// this set (spec section 32: "Never trust arbitrary frontend event
// properties" / "event-name allowlists"). Mirrors frontend/src/lib/
// analyticsEvents.js's ANALYTICS_EVENTS — if you add an event on one
// side, add it on the other, or it silently gets dropped here.
export const ALLOWED_EVENT_NAMES = new Set([
  "session_started",
  "session_ended",
  "page_view",
  "heartbeat",
  "primary_cta_clicked",
  "cta_click",
  "audio_upload_started",
  "audio_upload_completed",
  "audio_upload_failed",
  "analysis_started",
  "analysis_completed",
  "analysis_failed",
  "master_started",
  "master_completed",
  "master_failed",
  "second_master",
  "preview_started",
  "preview_before_selected",
  "preview_after_selected",
  "preview_completed",
  "download_clicked",
  "download_completed",
  "download_failed",
  "signup_started",
  "login",
  "login_completed",
  "pricing_view",
  "pricing_viewed",
  "plan_selected",
  "checkout_started",
  "begin_checkout",
  "checkout_redirected",
  "checkout_failed",
  "checkout_cancelled",
  "free_tool_opened",
  "free_tool_analysis_completed",
  "free_tool_master_cta_clicked",
]);

// Backend-only event names — never accepted from the public /collect
// endpoint (a client could never legitimately claim "payment_succeeded"),
// only ever written directly by server code that just observed the real
// outcome itself (spec section 9: "sales must be server authoritative").
export const SERVER_ONLY_EVENT_NAMES = new Set([
  "sign_up",
  "payment_succeeded",
  "payment_failed",
  "refund_created",
  "subscription_created",
  "subscription_renewed",
  "subscription_cancelled",
  "subscription_expired",
  "checkout_abandoned", // derived at query time, never written directly either — see computeAbandonedCheckouts below
  "share_created", // the /jobs/:jobId/share route observes this directly; a client claiming it created a share link proves nothing
]);

const SENSITIVE_QUERY_KEY_PATTERNS = [
  "token",
  "code",
  "email",
  "password",
  "session",
  "auth",
  "key",
  "secret",
  "dl",
];

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Strips anything that looks like a credential/identifier out of a path's
// query string before it's ever written to analyticsEvents — spec section
// 33's "central sanitizer." Applied server-side (not just trusted from the
// client) since this is the actual storage boundary.
export function sanitizePath(rawPath) {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/")) return "/";
  const trimmed = rawPath.slice(0, MAX_PATH_LEN);
  const qIndex = trimmed.indexOf("?");
  if (qIndex === -1) return trimmed;
  const pathname = trimmed.slice(0, qIndex);
  let params;
  try {
    params = new URLSearchParams(trimmed.slice(qIndex + 1));
  } catch {
    return pathname;
  }
  for (const key of [...params.keys()]) {
    const lower = key.toLowerCase();
    if (SENSITIVE_QUERY_KEY_PATTERNS.some((needle) => lower.includes(needle))) {
      params.delete(key);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function sanitizeReferrer(referrer) {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const url = new URL(referrer);
    return `${url.origin}${sanitizePath(url.pathname + url.search)}`.slice(0, MAX_STRING_LEN);
  } catch {
    return null;
  }
}

// Offline lookup (bundled MaxMind-derived DB, no external API call, no IP
// ever leaves this server) — the only geo source this app uses, in keeping
// with the same privacy stance that removed GA/Meta/TikTok. req.ip is
// trustworthy here because server.js already sets `trust proxy` for
// Caddy's X-Forwarded-For; "::ffff:"-prefixed IPv4-in-IPv6 addresses (what
// Node reports for an IPv4 client behind a proxy) need the prefix
// stripped or geoip-lite's lookup misses them entirely.
function resolveCountry(ip) {
  if (typeof ip !== "string" || !ip) return null;
  try {
    const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
    return geoip.lookup(normalized)?.country || null;
  } catch {
    return null;
  }
}

function referrerDomain(referrer) {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Small, dependency-free UA read — this app only needs three coarse
// buckets (mobile/tablet/desktop conversion comparisons, spec section 18's
// "are mobile users converting worse"), not a full device-detection
// library. Good enough for that, not meant to be exhaustive.
function parseUserAgent(ua) {
  const s = typeof ua === "string" ? ua : "";
  const deviceCategory = /Mobi|Android(?!.*Tablet)|iPhone/i.test(s) ? "mobile" : /Tablet|iPad/i.test(s) ? "tablet" : "desktop";
  let browser = "other";
  if (/Edg\//.test(s)) browser = "edge";
  else if (/Chrome\//.test(s) && !/Chromium/.test(s)) browser = "chrome";
  else if (/Firefox\//.test(s)) browser = "firefox";
  else if (/Safari\//.test(s) && !/Chrome/.test(s)) browser = "safari";
  let os = "other";
  if (/Windows/.test(s)) os = "windows";
  else if (/Mac OS X/.test(s)) os = "macos";
  else if (/Android/.test(s)) os = "android";
  else if (/iPhone|iPad|iOS/.test(s)) os = "ios";
  else if (/Linux/.test(s)) os = "linux";
  return { deviceCategory, browser, os };
}

function sanitizeProps(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(props)) {
    if (count >= MAX_PROP_KEYS) break;
    if (typeof key !== "string" || key.length === 0 || key.length > 60) continue;
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = key.toLowerCase().includes("path") || key.toLowerCase().includes("referrer") ? sanitizePath(value) : value.slice(0, MAX_STRING_LEN);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else {
      continue; // no nested objects/arrays — keeps this from becoming an arbitrary JSON sink (spec section 32)
    }
    count++;
  }
  return out;
}

function db() {
  return getFirestore();
}

export function newId() {
  return crypto.randomUUID();
}

// Whoever runs this dashboard shouldn't show up IN it — a founder testing
// their own product, logged into their own admin account, isn't "traffic."
// Cached with a short TTL rather than reading users/{uid} on every single
// event (recordServerEvent fires on nearly every mastering/checkout
// action): the role field changes rarely, so a few minutes of staleness
// costs nothing and saves a Firestore read per event at real traffic
// volumes.
const ADMIN_UID_CACHE_TTL_MS = 5 * 60 * 1000;
const adminUidCache = new Map(); // uid -> { isAdmin, expiresAt }

async function isAdminUid(uid) {
  if (!uid) return false;
  const cached = adminUidCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;
  let isAdmin = false;
  try {
    const snap = await db().collection("users").doc(uid).get();
    isAdmin = snap.data()?.role === "admin";
  } catch (error) {
    console.error("isAdminUid check failed (treating as non-admin):", error.message);
  }
  adminUidCache.set(uid, { isAdmin, expiresAt: Date.now() + ADMIN_UID_CACHE_TTL_MS });
  return isAdmin;
}

// ---------------------------------------------------------------------
// Ingestion — one batch of events from a single beacon/fetch call, all
// sharing one visitor/session/page context. Never throws outward: a
// caller (analyticsRoutes.js) always gets a 2xx-shaped result even if a
// write partially fails, because analytics must never surface as a
// user-facing error (spec section 31).
// ---------------------------------------------------------------------
export async function ingestBatch({ visitorId, sessionId, uid, ua, ip, isNewSession, context, events }) {
  if (!isUuid(visitorId) || !isUuid(sessionId)) {
    throw Object.assign(new Error("Invalid visitor/session id"), { status: 400 });
  }
  // Skip entirely, not just at query time — nothing about an admin's own
  // usage is written to analyticsVisitors/analyticsSessions/analyticsEvents
  // at all, so it can never leak into a report even if a future query
  // forgets to filter it out.
  if (uid && (await isAdminUid(uid))) {
    return { accepted: 0 };
  }
  if (!Array.isArray(events) || events.length === 0) return { accepted: 0 };
  const batchEvents = events.slice(0, MAX_EVENTS_PER_REQUEST).filter((e) => e && ALLOWED_EVENT_NAMES.has(e.name));
  if (batchEvents.length === 0) return { accepted: 0 };

  const { deviceCategory, browser, os } = parseUserAgent(ua);
  const now = new Date();
  const landingPage = sanitizePath(context?.landingPage || "/");
  const referrer = sanitizeReferrer(context?.referrer);
  const utm = {
    source: typeof context?.utmSource === "string" ? context.utmSource.slice(0, 80) : null,
    medium: typeof context?.utmMedium === "string" ? context.utmMedium.slice(0, 80) : null,
    campaign: typeof context?.utmCampaign === "string" ? context.utmCampaign.slice(0, 80) : null,
    content: typeof context?.utmContent === "string" ? context.utmContent.slice(0, 80) : null,
    term: typeof context?.utmTerm === "string" ? context.utmTerm.slice(0, 80) : null,
  };
  // Coarse geography only, never the raw IP itself (spec section 3) —
  // resolved server-side from the request IP via an offline DB, never
  // trusted from the client (a visitor's browser has no legitimate way to
  // know its own IP-derived country, and letting it claim one would just
  // be spoofable garbage in the admin dashboard).
  const country = resolveCountry(ip);

  const visitorRef = db().collection("analyticsVisitors").doc(visitorId);
  const sessionRef = db().collection("analyticsSessions").doc(sessionId);

  const [visitorSnap, sessionSnap] = await Promise.all([visitorRef.get(), sessionRef.get()]);
  const isNewVisitor = !visitorSnap.exists;

  const batch = db().batch();

  if (isNewVisitor) {
    batch.set(visitorRef, {
      visitorId,
      uid: uid || null,
      firstSeenAt: now,
      lastSeenAt: now,
      firstLandingPage: landingPage,
      firstReferrer: referrer,
      firstReferrerDomain: referrerDomain(referrer),
      firstUtmSource: utm.source,
      firstUtmMedium: utm.medium,
      firstUtmCampaign: utm.campaign,
      firstUtmContent: utm.content,
      firstUtmTerm: utm.term,
      sessionCount: 0,
    });
  } else {
    const patch = { lastSeenAt: now };
    // Links an anonymous visitor to the real account the FIRST time they
    // authenticate — never overwritten after that (spec section 2: "if
    // the visitor later creates/logs into an account, associate the
    // anonymous analytics identity with the internal user ID").
    if (uid && !visitorSnap.data()?.uid) patch.uid = uid;
    batch.set(visitorRef, patch, { merge: true });
  }

  const isTrulyNewSession = isNewSession || !sessionSnap.exists;
  if (isTrulyNewSession) {
    batch.set(sessionRef, {
      sessionId,
      visitorId,
      uid: uid || null,
      startedAt: now,
      lastSeenAt: now,
      endedAt: null,
      landingPage,
      exitPage: landingPage,
      referrer,
      referrerDomain: referrerDomain(referrer),
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      utmContent: utm.content,
      utmTerm: utm.term,
      deviceCategory,
      browser,
      os,
      country,
      authenticated: Boolean(uid),
      isNewVisitor,
      pageViewCount: 0,
      activeMs: 0,
      hasUploaded: false,
      hasAnalyzed: false,
      hasMastered: false,
      hasViewedPricing: false,
      hasStartedCheckout: false,
      hasPaid: false,
    });
    if (!isNewVisitor) {
      batch.set(visitorRef, { sessionCount: (visitorSnap.data()?.sessionCount || 0) + 1 }, { merge: true });
    }
  } else {
    batch.set(sessionRef, { lastSeenAt: now, uid: uid || sessionSnap.data()?.uid || null }, { merge: true });
  }

  const sessionPatch = {};
  const eventsCollection = db().collection("analyticsEvents");

  for (const evt of batchEvents) {
    const path = evt.path ? sanitizePath(evt.path) : null;
    const props = sanitizeProps(evt.props);
    const activeMsForEvent = typeof evt.activeMs === "number" && evt.activeMs > 0 && evt.activeMs < 3600000 ? Math.round(evt.activeMs) : null;
    const eventRef = eventsCollection.doc();
    batch.set(eventRef, {
      sessionId,
      visitorId,
      uid: uid || null,
      name: evt.name,
      ts: evt.ts && Number.isFinite(evt.ts) ? new Date(evt.ts) : now,
      path,
      props,
      // Stored on the event itself (not just folded into the session
      // total below) so a per-page active-time breakdown — "how long was
      // /lufs-meter actually active for" — can be computed later by
      // grouping page_view events by path, not just averaged per session.
      activeMs: activeMsForEvent,
      source: "frontend",
    });

    if (evt.name === "page_view") {
      sessionPatch.exitPage = path || sessionPatch.exitPage;
      sessionPatch.pageViewCount = (sessionSnap.exists ? sessionSnap.data().pageViewCount || 0 : 0) + 1;
    }
    if (evt.name === "audio_upload_completed" || evt.name === "free_tool_analysis_completed") sessionPatch.hasUploaded = true;
    if (evt.name === "analysis_completed") sessionPatch.hasAnalyzed = true;
    if (evt.name === "master_completed") sessionPatch.hasMastered = true;
    if (evt.name === "pricing_view" || evt.name === "pricing_viewed") sessionPatch.hasViewedPricing = true;
    if (evt.name === "checkout_started" || evt.name === "begin_checkout") sessionPatch.hasStartedCheckout = true;

    if (typeof evt.activeMs === "number" && evt.activeMs > 0 && evt.activeMs < 3600000) {
      sessionPatch.activeMs = (sessionPatch.activeMs || (sessionSnap.exists ? sessionSnap.data().activeMs || 0 : 0)) + Math.round(evt.activeMs);
    }
  }

  if (Object.keys(sessionPatch).length > 0) {
    batch.set(sessionRef, sessionPatch, { merge: true });
  }

  await batch.commit();
  return { accepted: batchEvents.length };
}

// ---------------------------------------------------------------------
// Backend-authoritative events — written directly by server code that
// just observed the real outcome (payments, subscriptions, mastering
// job results), never routed through the public /collect endpoint. See
// spec section 1: "Backend events... written directly from the backend
// rather than relying on browser events."
// ---------------------------------------------------------------------
export async function recordServerEvent(name, { uid = null, sessionId = null, visitorId = null, props = {} } = {}) {
  try {
    if (uid && (await isAdminUid(uid))) return;
    await db()
      .collection("analyticsEvents")
      .add({
        sessionId,
        visitorId,
        uid,
        name,
        ts: new Date(),
        path: null,
        props: sanitizeProps(props),
        source: "backend",
      });
    if (sessionId) {
      const patch = {};
      if (name === "master_completed") patch.hasMastered = true;
      if (name === "payment_succeeded") patch.hasPaid = true;
      if (Object.keys(patch).length) {
        await db().collection("analyticsSessions").doc(sessionId).set(patch, { merge: true }).catch(() => {});
      }
    }
  } catch (error) {
    // Never let analytics recording break the caller (a webhook ack, a
    // mastering response) — spec section 31.
    console.error(`Failed to record backend analytics event "${name}" (non-fatal):`, error.message);
  }
}

// Normalizes a raw error into one of a small, fixed set of categories —
// spec section 7. Best-effort string matching against whatever the
// underlying service actually throws; extend the patterns here rather
// than inventing a new ad-hoc reason string at a call site.
export function normalizeMasteringFailure(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "processing_timeout";
  if (msg.includes("invalid") && (msg.includes("audio") || msg.includes("file"))) return "invalid_audio";
  if (msg.includes("unsupported") || msg.includes("format")) return "unsupported_format";
  if (msg.includes("too large") || msg.includes("file size")) return "file_too_large";
  if (msg.includes("worker") || msg.includes("subprocess") || msg.includes("exit code")) return "worker_error";
  if (msg.includes("enospc") || msg.includes("no space") || msg.includes("memory")) return "resource_error";
  if (msg.includes("dsp") || msg.includes("processing")) return "dsp_error";
  if (msg.includes("network") || msg.includes("econnrefused") || msg.includes("fetch failed")) return "network_error";
  if (msg) return "server_error";
  return "unknown";
}

export function normalizeCheckoutFailure(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (msg.includes("declin")) return "card_declined";
  if (msg.includes("insufficient")) return "insufficient_funds";
  if (msg.includes("authentication") || msg.includes("3d secure") || msg.includes("3ds")) return "authentication_failed";
  if (msg.includes("expired")) return "expired_card";
  if (msg.includes("cancel")) return "payment_cancelled";
  if (msg) return "provider_error";
  return "unknown";
}

export { SESSION_INACTIVITY_MS, CHECKOUT_ABANDON_MS };
