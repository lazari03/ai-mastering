import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.ANALYTICS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acquisition-attribution-")), "analytics.db");
const { default: db } = await import("../../config/analyticsDb.js");
const { getAcquisition, getSales } = await import("../analyticsQueryService.js");

const addSession = db.prepare(`INSERT INTO analytics_sessions
  (session_id, visitor_id, uid, started_at, last_seen_at, utm_source)
  VALUES (?, ?, ?, ?, ?, ?)`);
const addPayment = db.prepare(`INSERT INTO analytics_events
  (session_id, uid, name, ts, props_json, source)
  VALUES (?, ?, 'payment_succeeded', ?, ?, 'backend')`);
const from = new Date("2026-11-01T00:00:00.000Z");
const to = new Date("2026-12-01T00:00:00.000Z");

test("a payment is attributed exactly once to its checkout session, not every visited source", async () => {
  addSession.run("sess-ig", "visitor-1", "payer-1", "2026-11-02T10:00:00.000Z", "2026-11-02T10:00:00.000Z", "instagram");
  addSession.run("sess-google", "visitor-2", "payer-1", "2026-11-03T10:00:00.000Z", "2026-11-03T10:00:00.000Z", "google");
  addPayment.run("sess-google", "payer-1", "2026-11-03T11:00:00.000Z", JSON.stringify({ amountCents: 999, currency: "eur" }));
  addPayment.run("sess-google", "payer-1", "2026-11-04T11:00:00.000Z", JSON.stringify({ amountCents: 999, currency: "eur" }));
  addPayment.run(null, "payer-unknown", "2026-11-05T11:00:00.000Z", JSON.stringify({ amountCents: 499, currency: "usd" }));
  const rows = await getAcquisition({ from, to });
  const instagram = rows.find((r) => r.source === "instagram");
  const google = rows.find((r) => r.source === "google");
  const unknown = rows.find((r) => r.source === "unattributed");
  assert.equal(instagram.customers, 0);
  assert.equal(instagram.revenue, 0);
  assert.equal(google.customers, 1);
  assert.equal(google.paymentEvents, 2);
  assert.deepEqual(google.revenueByCurrency, [{ currency: "EUR", amount: 19.98 }]);
  assert.equal(unknown.customers, 1);
  assert.deepEqual(unknown.revenueByCurrency, [{ currency: "USD", amount: 4.99 }]);
});

test("first-time customer reporting counts paying accounts, not payments", async () => {
  const report = await getSales({ from, to });
  assert.equal(report.newCustomers, 2);
});
