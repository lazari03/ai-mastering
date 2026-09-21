import crypto from "node:crypto";

import TelemetryDeck from "@telemetrydeck/sdk";

import { settings } from "../config/settings.js";

// Mirrors every analytics event to TelemetryDeck (telemetrydeck.com)
// alongside the existing SQLite store (analyticsService.js) — a deliberate
// dual-write, not a replacement: the SQLite-backed /admin/analytics/*
// pages keep working exactly as they do today while TelemetryDeck
// accumulates events in parallel, so nothing breaks and there's no
// all-or-nothing cutover. Whether/when to swap the admin UI over to read
// from TelemetryDeck's Query API instead is a separate, later decision.
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
export function sendSignal(type, { uid = null, visitorId = null, props = {} } = {}) {
  const td = getClient();
  if (!td) return; // not configured yet — silent no-op, not an error

  const payload = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    payload[key] = typeof value === "string" ? value : String(value);
  }

  td.signal(type.slice(0, 200), payload, { clientUser: uid || visitorId || "anonymous" }).catch((error) => {
    console.error(`TelemetryDeck signal "${type}" failed (non-fatal):`, error.message);
  });
}
