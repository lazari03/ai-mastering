"use client";

// TelemetryDeck, sent from the browser.
//
// It used to be mirrored from the Node backend, which made every signal
// arrive from the server: TelemetryDeck derives country from the sending
// IP and device/OS/browser from the sending User-Agent, so every visitor
// looked like one Node process in the server's datacenter, and the SDK's
// single random sessionID glued all visitors into one session. From the
// browser those fields are the visitor's own.
//
// Same identities as the first-party pipeline (analyticsClient.js): the
// clientUser is the signed-in uid or the anonymous visitorId (the SDK
// SHA-256-hashes it with the salt before sending), and the sessionID is the
// first-party session, so both dashboards agree on what a session is.
// Heartbeats are not forwarded — they're only for active-time accounting
// in the first-party store and would burn the free signal quota.
const APP_ID = process.env.NEXT_PUBLIC_TELEMETRYDECK_APP_ID || "";
const SALT = process.env.NEXT_PUBLIC_TELEMETRYDECK_SALT || "";
const SKIP = new Set(["heartbeat"]);
const INTERNAL_KEY = "af_internal_traffic";

// The backend already drops an admin's own events from the first-party
// store; this is the browser-side equivalent for TelemetryDeck. Set once
// this browser passes the admin gate (AdminAuthGate.jsx), so the founder
// testing the product never shows up as a visitor.
export function markInternalTraffic() {
  try {
    window.localStorage.setItem(INTERNAL_KEY, "1");
  } catch {
    // storage blocked — nothing to remember it in
  }
}
function isInternalTraffic() {
  try {
    return window.localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

let clientPromise = null;
function getClient() {
  if (!APP_ID || typeof window === "undefined") return null;
  if (!clientPromise) {
    clientPromise = import("@telemetrydeck/sdk")
      .then(({ default: TelemetryDeck }) => new TelemetryDeck({ appID: APP_ID, clientUser: "anonymous", salt: SALT || undefined, testMode: process.env.NODE_ENV !== "production" }))
      .catch(() => null);
  }
  return clientPromise;
}

function toPayload(props) {
  const out = {};
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

export function sendTelemetrySignal(name, { props = {}, path = null, clientUser, sessionId } = {}) {
  if (!APP_ID || SKIP.has(name) || isInternalTraffic()) return;
  const pending = getClient();
  if (!pending) return;
  pending
    .then((td) => {
      if (!td) return undefined;
      const payload = toPayload({ ...props, path: path || undefined });
      return td.signal(name.slice(0, 200), payload, { clientUser: clientUser || "anonymous", sessionID: sessionId || undefined });
    })
    // Blocked by an ad blocker, offline, or TelemetryDeck down — analytics
    // must never surface as an error.
    .catch(() => {});
}
