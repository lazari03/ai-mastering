import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Keep the analytics test database isolated from production and other suites.
process.env.ANALYTICS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sales-acquisition-")), "analytics.db");
const { default: db } = await import("../../config/analyticsDb.js");
const { getSales } = await import("../analyticsQueryService.js");

const insert = db.prepare("INSERT INTO analytics_events (uid, name, ts, source, props_json) VALUES (?, 'payment_succeeded', ?, 'server', ?)");

test("sales counts only distinct first observed purchasers, not repeat payments or renewals", async () => {
  const from = new Date("2026-11-01T00:00:00.000Z");
  const to = new Date("2026-12-01T00:00:00.000Z");
  // Existing customer purchased before the reporting window.
  insert.run("returning", "2026-10-20T00:00:00.000Z", '{"amountCents":999}');
  insert.run("returning", "2026-11-03T00:00:00.000Z", '{"amountCents":999}');
  // New customer pays twice during the current period.
  insert.run("new", "2026-11-04T00:00:00.000Z", '{"amountCents":499}');
  insert.run("new", "2026-11-05T00:00:00.000Z", '{"amountCents":499}');
  const result = await getSales({ from, to });
  assert.equal(result.newCustomers, 1);
  assert.equal(result.revenue, 24.96);
});

test("sales never calls a renewal a new customer when there are no first purchases in range", async () => {
  const result = await getSales({ from: new Date("2026-11-06T00:00:00.000Z"), to: new Date("2026-12-01T00:00:00.000Z") });
  assert.equal(result.newCustomers, 0);
});
