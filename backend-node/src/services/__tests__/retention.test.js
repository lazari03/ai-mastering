import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retention-"));
process.env.JOBS_DB_PATH = path.join(dir, "jobs.db");
process.env.ANALYTICS_DB_PATH = path.join(dir, "analytics.db");

const { default: jobsDb } = await import("../../config/jobsDb.js");
const { default: analyticsDb } = await import("../../config/analyticsDb.js");
const { purgeExpiredJobs, recordJob, ownsJob } = await import("../jobsService.js");
const { purgeOldAnalytics } = await import("../../config/analyticsDb.js");
const { resolveRange, getLive, MAX_RANGE_DAYS, LIVE_MAX_ROWS } = await import("../analyticsQueryService.js");

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

function insertJob(uid, id, preview, expiresAt) {
  jobsDb
    .prepare("INSERT INTO jobs (uid, job_id, created_at, expires_at, preview) VALUES (?, ?, ?, ?, ?)")
    .run(uid, id, iso(Date.parse(expiresAt) - 2 * DAY), expiresAt, preview);
}

test("purgeExpiredJobs: previews go at expiry, masters after grace, live rows kept, bounded", async () => {
  const now = Date.now();
  insertJob("u", "prev-expired", 1, iso(now - 1000));
  insertJob("u", "prev-live", 1, iso(now + DAY));
  insertJob("u", "master-just-expired", 0, iso(now - DAY));
  insertJob("u", "master-old", 0, iso(now - 40 * DAY));
  await recordJob("u", { job_id: "fresh-one" });

  const deleted = purgeExpiredJobs({ historyRetentionDays: 30, batchSize: 1, now });
  assert.equal(deleted, 1, "bounded by batchSize");
  const total = purgeExpiredJobs({ historyRetentionDays: 30, batchSize: 100, now });
  assert.equal(total, 1);
  assert.equal(await ownsJob("u", "prev-live"), true);
  assert.equal(await ownsJob("u", "master-just-expired"), true);
  assert.equal(await ownsJob("u", "fresh-one"), true);
  assert.equal(await ownsJob("u", "prev-expired"), false);
  assert.equal(await ownsJob("u", "master-old"), false);
  assert.equal(purgeExpiredJobs({ historyRetentionDays: 0 }), 0, "0 disables");
});

test("purgeOldAnalytics deletes only rows older than retention, bounded per call", () => {
  const now = Date.now();
  const old = iso(now - 500 * DAY);
  const recent = iso(now - 5 * DAY);
  const ev = analyticsDb.prepare("INSERT INTO analytics_events (name, ts) VALUES ('x', ?)");
  for (let i = 0; i < 5; i += 1) ev.run(old);
  ev.run(recent);
  analyticsDb
    .prepare("INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at) VALUES (?, 'v', ?, ?)")
    .run("s-old", old, old);
  analyticsDb
    .prepare("INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at) VALUES (?, 'v2', ?, ?)")
    .run("s-new", recent, recent);
  analyticsDb.prepare("INSERT INTO analytics_visitors (visitor_id, first_seen_at, last_seen_at) VALUES ('v', ?, ?)").run(old, old);

  const first = purgeOldAnalytics({ retentionDays: 400, batchSize: 3, now });
  assert.equal(first.events, 3);
  const second = purgeOldAnalytics({ retentionDays: 400, batchSize: 3, now });
  assert.equal(second.events, 2);
  assert.equal(second.sessions + first.sessions, 1);
  assert.equal(analyticsDb.prepare("SELECT COUNT(*) c FROM analytics_events").get().c, 1);
  assert.equal(analyticsDb.prepare("SELECT COUNT(*) c FROM analytics_sessions").get().c, 1);
  assert.equal(analyticsDb.prepare("SELECT COUNT(*) c FROM analytics_visitors").get().c, 0);
  assert.deepEqual(purgeOldAnalytics({ retentionDays: 0, now }), { events: 0, sessions: 0, visitors: 0 });
});

test("resolveRange clamps unbounded / inverted / future ranges", () => {
  const r = resolveRange({ from: "2000-01-01", to: "2100-01-01" });
  const span = (r.to - r.from) / DAY;
  assert.ok(span <= MAX_RANGE_DAYS + 1e-6, `span ${span}`);
  assert.ok(r.to.getTime() <= Date.now() + 5);
  const inv = resolveRange({ from: "2026-05-01", to: "2026-01-01" });
  assert.ok(inv.from < inv.to);
  const ok = resolveRange({ preset: "30d" });
  assert.ok(Math.abs((ok.to - ok.from) / DAY - 30) < 1.1);
});

test("getLive caps the rows it reads", async () => {
  const stmt = analyticsDb.prepare("INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at) VALUES (?, ?, ?, ?)");
  const t = iso(Date.now());
  analyticsDb.transaction(() => {
    for (let i = 0; i < LIVE_MAX_ROWS + 500; i += 1) stmt.run(`live-${i}`, `lv-${i}`, t, t);
  })();
  const live = await getLive();
  assert.equal(live.activeVisitors, LIVE_MAX_ROWS);
});
