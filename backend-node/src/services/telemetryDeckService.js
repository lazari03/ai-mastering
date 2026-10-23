import crypto from "node:crypto";

import TelemetryDeck from "@telemetrydeck/sdk";

import { settings } from "../config/settings.js";

// Server-observed events only (payments, subscriptions, sign-ups, share
// links, mastering results) go to TelemetryDeck from here. Everything the
// browser tracks is sent by the browser itself (frontend/src/lib/
// telemetryDeck.js): TelemetryDeck derives country from the sending IP and
// device/OS/browser from the sending User-Agent, so signals mirrored from
// this server all looked like one Node process in the server's datacenter.
//
// Uses the official @telemetrydeck/sdk rather than hand-rolling the v2
// ingest request — it handles clientUser hashing (SHA-256 + salt),
// sessionID, and the wire format itself, per TelemetryDeck's own Node.js
// setup guide (globalThis.crypto.subtle doesn't exist in Node, hence
// passing crypto.webcrypto.subtle explicitly).
let client = null;
function getClient() {
  if (client) return client;
  if (!settings.telemetryDeckAppId) return null;
  client = new TelemetryDeck({
    appID: settings.telemetryDeckAppId,
    clientUser: "unset", // always overridden per-call below — see sendSignal
    salt: settings.telemetryDeckSalt || undefined,
    testMode: settings.nodeEnv !== "production",
    subtleCrypto: crypto.webcrypto.subtle,
  });
  return client;
}

// Best-effort, fire-and-forget — analytics must never slow down or break
// a real user-facing request just because a third-party ingestion call is
// slow or down. Every call site already does the same for the SQLite
// write path (recordServerEvent's own try/catch, ingestBatch's "must
// never look like a real API error" comment); this follows the identical
// discipline for the new destination.
export function sendSignal(type, { uid = null, visitorId = null, sessionId = null, props = {} } = {}) {
  const td = getClient();
  if (!td) return; // not configured yet — silent no-op, not an error

  const payload = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    payload[key] = typeof value === "string" ? value : String(value);
  }

  // sessionID per call: the SDK otherwise stamps one random ID, chosen at
  // startup, on every signal this process ever sends — i.e. every user in
  // one "session".
  td.signal(type.slice(0, 200), payload, { clientUser: uid || visitorId || "anonymous", sessionID: sessionId || uid || visitorId || "server" }).catch((error) => {
    console.error(`TelemetryDeck signal "${type}" failed (non-fatal):`, error.message);
  });
}
