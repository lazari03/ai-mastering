import crypto from "node:crypto";
import geoip from "geoip-lite";

import { getFirestore } from "../config/firebase.js";
import analyticsDb from "../config/analyticsDb.js";

// ---------------------------------------------------------------------
// First-party analytics: visitors, sessions, events — stored in a local
// SQLite database (see config/analyticsDb.js for why: this used to be
// Firestore, and being by far the highest-volume write path in the app —
// a write on essentially every heartbeat/page-view/event, for every
// visitor, all day — is exactly what exhausted Firestore's free daily
// write quota. Everything else the app persists (users, jobs, billing)
// stays on Firestore; this migration is scoped to analytics only.
// There is no separate warehouse or aggregation table (yet) — admin
// queries read analytics_events/analytics_sessions directly and reduce in
// memory, which is the right amount of infrastructure for this app's
// actual traffic (see PERFORMANCE section of the spec this implements).
// ---------------------------------------------------------------------

const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes — spec section 2
const CHECKOUT_ABANDON_MS = 30 * 60 * 1000; // spec section 8 — configurable here, one place

// Write throttles for ingestBatch's per-call bookkeeping writes (visitor/
// session lastSeenAt) — see the comments at each use site. These predate
// the SQLite move (they were originally what stood between this endpoint
// and Firestore's daily write quota) and are kept even without that quota
// pressure: this endpoint is still hit by every heartbeat/page-view/event
// from every visitor, all day, and there's no reason to churn a row on
// every single one of those when the value barely changes.
const VISITOR_LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const SESSION_LAST_SEEN_THROTTLE_MS = 2 * 60 * 1000;

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
// query string before it's ever written to analytics_events — spec section
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

export function newId() {
  return crypto.randomUUID();
}

// Whoever runs this dashboard shouldn't show up IN it — a founder testing
// their own product, logged into their own admin account, isn't "traffic."
// Still backed by Firestore (the users/{uid}.role field, same one
// requireAdmin.js reads) since that's low-volume — a handful of admin
// accounts, checked at most once per cache TTL, not a quota risk the way
// per-event analytics writes were. Cached with a short TTL rather than
// reading on every single event (recordServerEvent fires on nearly every
// mastering/checkout action): the role field changes rarely, so a few
// minutes of staleness costs nothing and saves a Firestore read per event.
const ADMIN_UID_CACHE_TTL_MS = 5 * 60 * 1000;
const adminUidCache = new Map(); // uid -> { isAdmin, expiresAt }

async function isAdminUid(uid) {
  if (!uid) return false;
  const cached = adminUidCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;
  let isAdmin = false;
  try {
    const snap = await getFirestore().collection("users").doc(uid).get();
    isAdmin = snap.data()?.role === "admin";
  } catch (error) {
    console.error("isAdminUid check failed (treating as non-admin):", error.message);
  }
  adminUidCache.set(uid, { isAdmin, expiresAt: Date.now() + ADMIN_UID_CACHE_TTL_MS });
  return isAdmin;
}

// ---------------------------------------------------------------------
// Prepared statements — created once, reused across every call. better-
// sqlite3 is synchronous by design (no round trip to a separate DB
// process), which is what lets ingestBatch below read-then-write inside
// one atomic transaction without any of the async batching machinery the
// old Firestore version needed.
// ---------------------------------------------------------------------
const getVisitorStmt = analyticsDb.prepare("SELECT * FROM analytics_visitors WHERE visitor_id = ?");
const insertVisitorStmt = analyticsDb.prepare(`
  INSERT INTO analytics_visitors
    (visitor_id, uid, first_seen_at, last_seen_at, first_landing_page, first_referrer, first_referrer_domain,
     first_utm_source, first_utm_medium, first_utm_campaign, first_utm_content, first_utm_term, session_count)
  VALUES (@visitorId, @uid, @now, @now, @landingPage, @referrer, @referrerDomain,
          @utmSource, @utmMedium, @utmCampaign, @utmContent, @utmTerm, 0)
`);

const getSessionStmt = analyticsDb.prepare("SELECT * FROM analytics_sessions WHERE session_id = ?");
const insertSessionStmt = analyticsDb.prepare(`
  INSERT INTO analytics_sessions
    (session_id, visitor_id, uid, started_at, last_seen_at, ended_at, landing_page, exit_page, referrer,
     referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, device_category, browser,
     os, country, authenticated, is_new_visitor, page_view_count, active_ms, has_uploaded, has_analyzed,
     has_mastered, has_viewed_pricing, has_started_checkout, has_paid)
  VALUES
    (@sessionId, @visitorId, @uid, @now, @now, NULL, @landingPage, @landingPage, @referrer,
     @referrerDomain, @utmSource, @utmMedium, @utmCampaign, @utmContent, @utmTerm, @deviceCategory, @browser,
     @os, @country, @authenticated, @isNewVisitor, 0, 0, 0, 0,
     0, 0, 0, 0)
`);

const insertEventStmt = analyticsDb.prepare(`
  INSERT INTO analytics_events (session_id, visitor_id, uid, name, ts, path, props_json, active_ms, source)
  VALUES (@sessionId, @visitorId, @uid, @name, @ts, @path, @propsJson, @activeMs, @source)
`);

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
  // usage is written to analytics_visitors/analytics_sessions/
  // analytics_events at all, so it can never leak into a report even if a
  // future query forgets to filter it out.
  if (uid && (await isAdminUid(uid))) {
    return { accepted: 0 };
  }
  if (!Array.isArray(events) || events.length === 0) return { accepted: 0 };
  const batchEvents = events.slice(0, MAX_EVENTS_PER_REQUEST).filter((e) => e && ALLOWED_EVENT_NAMES.has(e.name));
  if (batchEvents.length === 0) return { accepted: 0 };

  const { deviceCategory, browser, os } = parseUserAgent(ua);
  const now = new Date().toISOString();
  const landingPage = sanitizePath(context?.landingPage || "/");
  const referrer = sanitizeReferrer(context?.referrer);
  const refDomain = referrerDomain(referrer);
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

  // One synchronous transaction — either the whole batch lands or none of
  // it does, and there's no network round trip in the middle to race
  // against (unlike the old Firestore batch.commit()).
  const run = analyticsDb.transaction(() => {
    const visitorRow = getVisitorStmt.get(visitorId);
    const isNewVisitor = !visitorRow;

    if (isNewVisitor) {
      insertVisitorStmt.run({
        visitorId,
        uid: uid || null,
        now,
        landingPage,
        referrer,
        referrerDomain: refDomain,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
        utmTerm: utm.term,
      });
    } else {
      // Visitor-level lastSeenAt only ever feeds day-granularity retention
      // stats (getRetention) — it never needs per-heartbeat freshness, so
      // it's written at most once per this window instead of on every
      // ingest call. Same throttle principle as requireAuth.js's
      // LAST_ACTIVE_WRITE_THROTTLE_MS.
      const lastSeenStale = Date.now() - new Date(visitorRow.last_seen_at).getTime() > VISITOR_LAST_SEEN_THROTTLE_MS;
      // Links an anonymous visitor to the real account the FIRST time they
      // authenticate — never overwritten after that (spec section 2: "if
      // the visitor later creates/logs into an account, associate the
      // anonymous analytics identity with the internal user ID").
      const uidNeedsSet = uid && !visitorRow.uid;
      if (lastSeenStale || uidNeedsSet) {
        analyticsDb
          .prepare("UPDATE analytics_visitors SET last_seen_at = @lastSeenAt, uid = @uid WHERE visitor_id = @visitorId")
          .run({
            lastSeenAt: lastSeenStale ? now : visitorRow.last_seen_at,
            uid: uidNeedsSet ? uid : visitorRow.uid,
            visitorId,
          });
      }
    }

    const sessionRow = getSessionStmt.get(sessionId);
    const isTrulyNewSession = isNewSession || !sessionRow;

    if (isTrulyNewSession) {
      insertSessionStmt.run({
        sessionId,
        visitorId,
        uid: uid || null,
        landingPage,
        referrer,
        referrerDomain: refDomain,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
        utmTerm: utm.term,
        deviceCategory,
        browser,
        os,
        country,
        authenticated: uid ? 1 : 0,
        isNewVisitor: isNewVisitor ? 1 : 0,
        now,
      });
      if (!isNewVisitor) {
        analyticsDb.prepare("UPDATE analytics_visitors SET session_count = session_count + 1 WHERE visitor_id = ?").run(visitorId);
      }
    } else {
      // Throttled more gently than the visitor write above (getLive's
      // "active in the last 5 minutes" window depends on this staying
      // reasonably fresh).
      const sessionStale = Date.now() - new Date(sessionRow.last_seen_at).getTime() > SESSION_LAST_SEEN_THROTTLE_MS;
      const uidChanged = uid && uid !== sessionRow.uid;
      if (sessionStale || uidChanged) {
        analyticsDb
          .prepare("UPDATE analytics_sessions SET last_seen_at = @lastSeenAt, uid = @uid WHERE session_id = @sessionId")
          .run({ lastSeenAt: now, uid: uid || sessionRow.uid || null, sessionId });
      }
    }

    // Dynamic per-event session patch, same shape as the old Firestore
    // merge patch — built as actual column names so the UPDATE below can
    // stay one generic statement instead of one per possible field.
    // Running totals seed from the real existing row when there is one
    // (matches the old Firestore logic's "sessionSnap.exists ?
    // sessionSnap.data().X : 0" — keyed off whether a row existed at all,
    // not off isTrulyNewSession, which can be true for a row that already
    // exists if the client mis-flags isNewSession).
    let runningPageViewCount = sessionRow?.page_view_count || 0;
    let runningActiveMs = sessionRow?.active_ms || 0;
    const sessionPatch = {};

    for (const evt of batchEvents) {
      const path = evt.path ? sanitizePath(evt.path) : null;
      const props = sanitizeProps(evt.props);
      const activeMsForEvent = typeof evt.activeMs === "number" && evt.activeMs > 0 && evt.activeMs < 3600000 ? Math.round(evt.activeMs) : null;
      insertEventStmt.run({
        sessionId,
        visitorId,
        uid: uid || null,
        name: evt.name,
        ts: evt.ts && Number.isFinite(evt.ts) ? new Date(evt.ts).toISOString() : now,
        path,
        propsJson: JSON.stringify(props),
        activeMs: activeMsForEvent,
        source: "frontend",
      });

      if (evt.name === "page_view") {
        sessionPatch.exit_page = path || sessionPatch.exit_page;
        runningPageViewCount += 1;
        sessionPatch.page_view_count = runningPageViewCount;
      }
      if (evt.name === "audio_upload_completed" || evt.name === "free_tool_analysis_completed") sessionPatch.has_uploaded = 1;
      if (evt.name === "analysis_completed") sessionPatch.has_analyzed = 1;
      if (evt.name === "master_completed") sessionPatch.has_mastered = 1;
      if (evt.name === "pricing_view" || evt.name === "pricing_viewed") sessionPatch.has_viewed_pricing = 1;
      if (evt.name === "checkout_started" || evt.name === "begin_checkout") sessionPatch.has_started_checkout = 1;

      if (activeMsForEvent) {
        runningActiveMs += activeMsForEvent;
        sessionPatch.active_ms = runningActiveMs;
      }
    }

    const patchKeys = Object.keys(sessionPatch);
    if (patchKeys.length > 0) {
      const setClause = patchKeys.map((k) => `${k} = @${k}`).join(", ");
      analyticsDb.prepare(`UPDATE analytics_sessions SET ${setClause} WHERE session_id = @sessionId`).run({ ...sessionPatch, sessionId });
    }
  });

  run();
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
    insertEventStmt.run({
      sessionId,
      visitorId,
      uid,
      name,
      ts: new Date().toISOString(),
      path: null,
      propsJson: JSON.stringify(sanitizeProps(props)),
      activeMs: null,
      source: "backend",
    });
    if (sessionId) {
      const patch = {};
      if (name === "master_completed") patch.has_mastered = 1;
      if (name === "payment_succeeded") patch.has_paid = 1;
      const keys = Object.keys(patch);
      if (keys.length) {
        const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
        try {
          analyticsDb.prepare(`UPDATE analytics_sessions SET ${setClause} WHERE session_id = @sessionId`).run({ ...patch, sessionId });
        } catch {
          // Non-fatal — same as the old Firestore .catch(() => {}) here.
        }
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
  // The Python service's own concurrency cap rejecting a request (see
  // mastering.py's _master_slots) — a real, expected-under-load outcome,
  // not a bug, so it gets its own category rather than bucketing into
  // dsp_error/server_error and skewing "something's broken" error reports.
  if (msg.includes("capacity")) return "server_busy";
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
