"use client";

import { sendTelemetrySignal } from "./telemetryDeck";

// ---------------------------------------------------------------------
// First-party analytics client — the one place that talks to
// /analytics/collect. No third-party SDK, no fingerprinting: a visitorId
// and sessionId are both a plain crypto.randomUUID() stored in
// localStorage, nothing derived from canvas/fonts/hardware/IP+UA.
//
// Failure here must never affect the product (spec section 31) — every
// public function below swallows its own errors and never throws.
// ---------------------------------------------------------------------

const STORAGE = {
  visitorId: "af_visitor_id",
  sessionId: "af_session_id",
  sessionLastActive: "af_session_last_active",
  sessionContext: "af_session_context",
};

const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // spec section 2
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_BEFORE_FORCE_FLUSH = 10;
// Every heartbeat is a real Firestore write on the backend (ingestBatch),
// for every open tab, for as long as the tab stays visible — at 10s this
// alone was enough to burn through Firestore's Spark-plan daily write
// quota (see analyticsService.js's ingestBatch). 30s still gives
// avgSessionSeconds plenty of resolution for aggregate reporting; nobody
// reads "how active was this visitor" down to 10-second precision.
const HEARTBEAT_INTERVAL_MS = 30000;
const IDLE_TIMEOUT_MS = 60000; // no interaction for this long => not "active" (spec section 5)

// Mirrors backend-node's ALLOWED_EVENT_NAMES (analyticsService.js) — kept
// as a separate literal here rather than fetched at runtime, since this
// is a client-side safety net (don't even bother sending a typo'd event
// name), not the actual security boundary (the backend re-validates
// everything regardless, since a frontend check can always be bypassed).
const KNOWN_EVENT_NAMES = new Set([
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const COLLECT_URL = `${API_BASE}/analytics/collect`;

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / storage disabled — analytics just becomes a fresh
    // "session" every call rather than throwing anywhere.
  }
}

function isBrowser() {
  return typeof window !== "undefined";
}

function newId() {
  return crypto.randomUUID();
}

// Same sanitizer shape as the backend's (analyticsService.js) — applied
// here too so a client bug (or someone poking at the console) can't stuff
// a query string full of tokens into an event even before it leaves the
// browser. The backend re-applies this regardless; this is defense in
// depth, not the boundary itself.
const SENSITIVE_QUERY_NEEDLES = ["token", "code", "email", "password", "session", "auth", "key", "secret", "dl"];
function sanitizePath(path) {
  if (typeof path !== "string") return "/";
  const [pathname, query] = path.split("?");
  if (!query) return pathname || "/";
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_NEEDLES.some((needle) => key.toLowerCase().includes(needle))) params.delete(key);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function getVisitorId() {
  let id = safeGet(STORAGE.visitorId);
  if (!id) {
    id = newId();
    safeSet(STORAGE.visitorId, id);
  }
  return id;
}

function getSessionContext() {
  let session = getOrCreateSessionId();
  const raw = safeGet(STORAGE.sessionContext);
  let context = null;
  try {
    context = raw ? JSON.parse(raw) : null;
  } catch {
    context = null;
  }
  if (!context) {
    const params = new URLSearchParams(window.location.search);
    context = {
      landingPage: sanitizePath(window.location.pathname + window.location.search),
      referrer: document.referrer || null,
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmContent: params.get("utm_content"),
      utmTerm: params.get("utm_term"),
    };
    safeSet(STORAGE.sessionContext, JSON.stringify(context));
  }
  return { session, context };
}

let sessionJustRotated = false;

// Rotates after SESSION_INACTIVITY_MS of no track() call (spec section
// 2) — a fresh sessionId, and the stored "session context" (landing page/
// referrer/UTMs) resets so the new session gets its own attribution
// rather than inheriting the previous one's.
function getOrCreateSessionId() {
  const now = Date.now();
  const lastActive = Number(safeGet(STORAGE.sessionLastActive) || 0);
  let id = safeGet(STORAGE.sessionId);
  if (!id || now - lastActive > SESSION_INACTIVITY_MS) {
    id = newId();
    safeSet(STORAGE.sessionId, id);
    safeSet(STORAGE.sessionContext, "");
    sessionJustRotated = true;
  }
  safeSet(STORAGE.sessionLastActive, String(now));
  return id;
}

// ---------------------------------------------------------------------
// Active-time tracking (spec section 5) — a simple interaction-based idle
// check, not full mouse/keystroke recording (nothing is stored beyond a
// timestamp of "something happened recently"). Ticks once a second while
// the tab is visible; a heartbeat event fires on its own slower interval
// carrying however many of those ticks actually counted as active.
// ---------------------------------------------------------------------
let lastInteractionAt = Date.now();
let currentPath = null;
let heartbeatAccumulatorMs = 0;
let tickInterval = null;
let heartbeatInterval = null;
let uidRef = null;

function markInteraction() {
  lastInteractionAt = Date.now();
}

function isPageVisible() {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

function tick() {
  if (!isPageVisible()) return;
  if (Date.now() - lastInteractionAt > IDLE_TIMEOUT_MS) return;
  heartbeatAccumulatorMs += 1000;
}

function flushHeartbeat() {
  if (heartbeatAccumulatorMs <= 0 || !currentPath) return;
  enqueue("heartbeat", { activeMs: heartbeatAccumulatorMs, path: currentPath });
  heartbeatAccumulatorMs = 0;
}

// ---------------------------------------------------------------------
// Batching + delivery
// ---------------------------------------------------------------------
let queue = [];
let flushTimer = null;

function enqueue(name, { props = {}, activeMs = null, path = null } = {}) {
  if (!isBrowser() || !KNOWN_EVENT_NAMES.has(name)) return;
  queue.push({ name, props, activeMs, path: path ? sanitizePath(path) : currentPath, ts: Date.now() });
  if (queue.length >= MAX_QUEUE_BEFORE_FORCE_FLUSH) flush();
  else scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function flush(useBeacon = false) {
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  const { session, context } = getSessionContext();
  const payload = JSON.stringify({
    visitorId: getVisitorId(),
    sessionId: session,
    uid: uidRef,
    isNewSession: sessionJustRotated,
    context,
    events,
  });
  sessionJustRotated = false;

  const clientUser = uidRef || getVisitorId();
  for (const evt of events) {
    sendTelemetrySignal(evt.name, { props: evt.props, path: evt.path, clientUser, sessionId: session });
  }

  try {
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(COLLECT_URL, blob);
    } else {
      fetch(COLLECT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch {
    // Never let a delivery failure surface anywhere — analytics is purely
    // observational (spec section 31).
  }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

// Called once from a Firebase auth-state listener (see AuthInit.jsx) —
// links this browser's anonymous visitor identity to the real account the
// first time it's known, never exposed further than that one field.
export function identify(uid) {
  uidRef = uid || null;
}

// Called when entering a route that must never be tracked (the admin
// dashboard — that's the site owner's own traffic, not a visitor's, and
// counting it would pollute every visitor/funnel/time-on-page number).
// Flushes whatever heartbeat time had genuinely accumulated for the real
// page just left (that time IS real visitor activity, still worth
// keeping), then clears currentPath so the ongoing tick()/heartbeat
// interval has nothing to attribute time to while on the untracked route
// — otherwise that dwell time would silently land on whichever real page
// is visited next, once trackPageView runs again there.
export function pauseTracking() {
  if (!isBrowser()) return;
  flushHeartbeat();
  currentPath = null;
  heartbeatAccumulatorMs = 0;
}

export function trackPageView(path) {
  if (!isBrowser()) return;
  flushHeartbeat();
  currentPath = sanitizePath(path);
  getOrCreateSessionId();
  enqueue("page_view", { path: currentPath });
}

export function track(name, props = {}) {
  if (!isBrowser()) return;
  enqueue(name, { props });
}

let initialized = false;
export function initAnalyticsClient() {
  if (!isBrowser() || initialized) return;
  initialized = true;

  ["mousemove", "keydown", "scroll", "touchstart", "click"].forEach((evt) => window.addEventListener(evt, markInteraction, { passive: true }));

  tickInterval = setInterval(tick, 1000);
  heartbeatInterval = setInterval(flushHeartbeat, HEARTBEAT_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushHeartbeat();
      flush(true);
    } else {
      markInteraction();
    }
  });

  window.addEventListener("pagehide", () => {
    flushHeartbeat();
    flush(true);
  });
}
