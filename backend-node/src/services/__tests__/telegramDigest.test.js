import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.ANALYTICS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tg-digest-")), "analytics.db");
const { digestDue, buildDailyDigest } = await import("../telegramService.js");

const TZ = "Europe/Tirane";

test("digest is due once, in the configured local hour", () => {
  // 07:30 UTC = 08:30 in Tirana (UTC+1 in November)
  const at = new Date("2026-11-15T07:30:00Z");
  const first = digestDue(at, null, 8, TZ);
  assert.deepEqual(first, { due: true, localDate: "2026-11-15" });
  assert.equal(digestDue(new Date("2026-11-15T07:45:00Z"), first.localDate, 8, TZ).due, false, "not twice the same day");
  assert.equal(digestDue(new Date("2026-11-16T07:05:00Z"), first.localDate, 8, TZ).due, true, "due again next day");
});

test("digest is not due outside the hour, and follows local time not UTC", () => {
  assert.equal(digestDue(new Date("2026-11-15T08:30:00Z"), null, 8, TZ).due, false); // 09:30 local
  assert.equal(digestDue(new Date("2026-11-15T06:59:00Z"), null, 8, TZ).due, false); // 07:59 local
  // summer time: 06:10 UTC = 08:10 in Tirana (UTC+2)
  assert.equal(digestDue(new Date("2026-07-01T06:10:00Z"), null, 8, TZ).due, true);
});

test("digest text is built from the funnel and acquisition queries on an empty database", async () => {
  const text = await buildDailyDigest();
  assert.ok(text.startsWith("Daily overview"));
  assert.ok(text.includes("Funnel - yesterday"));
  assert.ok(text.includes("Acquisition - yesterday"));
  assert.ok(text.includes("Visitors:"));
});
