import crypto from "node:crypto";

import { settings } from "../config/settings.js";

// Mirrors every analytics event to TelemetryDeck (telemetrydeck.com)
// alongside the existing SQLite store (analyticsService.js) — a deliberate
// dual-write, not a replacement: the SQLite-backed /admin/analytics/*
// pages keep working exactly as they do today while TelemetryDeck
// accumulates events in parallel, so nothing breaks and there's no
// all-or-nothing cutover. Whether/when to swap the admin UI over to read
// from TelemetryDeck's Query API instead is a separate, later decision.
//
// clientUser is TelemetryDeck's per-user identifier for funnels/retention
// — sent as a SHA-256 hash of our own uid/visitorId, never the raw id
// itself, matching this app's existing privacy discipline (see
// requireAuth's hashToken and analyticsService's "coarse geography only,
// never the raw IP" comment).
function hashId(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const INGEST_URL_BASE = "https://nom.telemetrydeck.com/v2/namespace";

// Best-effort, fire-and-forget — analytics must never slow down or break
// a real user-facing request just because a third-party ingestion call is
// slow or down. Every call site below already does the same for the
// SQLite write path (recordServerEvent's own try/catch, ingestBatch's
// "must never look like a real API error" comment); this follows the
// identical discipline for the new destination.
export function sendSignal(type, { uid = null, visitorId = null, floatValue = null, props = {} } = {}) {
  if (!settings.telemetryDeckAppId) return; // not configured yet — silent no-op, not an error

  const clientUser = hashId(uid || visitorId || "anonymous");
  const payload = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    // TelemetryDeck payload values must be strings (or the reserved
    // floatValue field below) — numbers/booleans get stringified rather
    // than dropped, so nothing silently disappears from the signal.
    payload[key] = typeof value === "string" ? value : String(value);
  }

  const body = [
    {
      appID: settings.telemetryDeckAppId,
      clientUser,
      type: type.slice(0, 200),
      isTestMode: settings.nodeEnv !== "production",
      ...(typeof floatValue === "number" && Number.isFinite(floatValue) ? { floatValue } : {}),
      payload,
    },
  ];

  fetch(`${INGEST_URL_BASE}/${settings.telemetryDeckAppId}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.error(`TelemetryDeck signal "${type}" failed (non-fatal):`, error.message);
  });
}
