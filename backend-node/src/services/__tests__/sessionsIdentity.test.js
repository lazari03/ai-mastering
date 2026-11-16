import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-identity-"));
process.env.JOBS_DB_PATH = path.join(dir, "jobs.db");
process.env.ANALYTICS_DB_PATH = path.join(dir, "analytics.db");

const { default: analyticsDb } = await import("../../config/analyticsDb.js");
const { listSessions, getSessionDetail } = await import("../analyticsQueryService.js");

const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

function visitor(id, uid) {
  analyticsDb
    .prepare("INSERT INTO analytics_visitors (visitor_id, uid, first_seen_at, last_seen_at, session_count) VALUES (?, ?, ?, ?, 1)")
    .run(id, uid, iso(now - 400 * DAY), iso(now));
}
function session(id, visitorId, uid, startedMs, isNew) {
  analyticsDb
    .prepare("INSERT INTO analytics_sessions (session_id, visitor_id, uid, started_at, last_seen_at, authenticated, is_new_visitor) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, visitorId, uid, iso(startedMs), iso(startedMs + 60000), uid ? 1 : 0, isNew ? 1 : 0);
}

visitor("v-known", "user-1");
visitor("v-anon", null);
session("s-old-signed-in", "v-known", "user-1", now - 200 * DAY, true);
session("s-return-anon", "v-known", null, now - 1 * DAY, false);
session("s-stranger", "v-anon", null, now - 2 * DAY, false);
session("s-stranger-new", "v-anon", null, now - 3 * DAY, true);

const week = { from: new Date(now - 7 * DAY), to: new Date(now) };

test("anonymous return visit resolves to the account via the visitor record", async () => {
  const { sessions } = await listSessions({ ...week, filters: {} });
  const ret = sessions.find((s) => s.id === "s-return-anon");
  assert.equal(ret.userUid, "user-1");
  assert.equal(ret.userLinkedVia, "visitor");
  assert.equal(ret.visitorId, "v-known");
  const stranger = sessions.find((s) => s.id === "s-stranger");
  assert.equal(stranger.userUid, null);
});

test("filters run in SQL: returning and identified", async () => {
  const returning = await listSessions({ ...week, filters: { newOrReturning: "returning" } });
  assert.deepEqual(returning.sessions.map((s) => s.id).sort(), ["s-return-anon", "s-stranger"]);
  const identified = await listSessions({ ...week, filters: { identified: true } });
  assert.deepEqual(identified.sessions.map((s) => s.id), ["s-return-anon"]);
});

test("id search ignores the date range and spans the person's full history", async () => {
  const byUser = await listSessions({ ...week, filters: { q: "user-1" } });
  assert.deepEqual(byUser.sessions.map((s) => s.id), ["s-return-anon", "s-old-signed-in"]);
  const bySession = await listSessions({ ...week, filters: { q: "s-old-signed-in" } });
  assert.equal(bySession.sessions.length, 1);
  assert.equal(bySession.sessions[0].userLinkedVia, "session");
});

test("paging returns older rows through the cursor", async () => {
  const first = await listSessions({ ...week, filters: {}, limit: 2 });
  assert.equal(first.sessions.length, 2);
  assert.equal(first.nextCursor, "2");
  const second = await listSessions({ ...week, filters: {}, limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.sessions.map((s) => s.id), ["s-stranger-new"]);
  assert.equal(second.nextCursor, null);
});

test("session detail carries the linked user", async () => {
  const { session: s } = await getSessionDetail("s-return-anon");
  assert.equal(s.userUid, "user-1");
});
