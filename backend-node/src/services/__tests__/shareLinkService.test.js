import { test } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

// Keep the module-level default store off the real data/jobs.db.
process.env.JOBS_DB_PATH = ":memory:";
const { createShareLinkStore, hashToken, isWellFormedToken, ShareLinkError, MIN_EXPIRY_SECONDS, MAX_ACTIVE_LINKS_PER_JOB } = await import(
  "../shareLinkService.js"
);

const HOUR = 3600 * 1000;
const NOW = Date.parse("2026-03-01T12:00:00Z");
const JOB_EXPIRES = new Date(NOW + 48 * HOUR).toISOString();

function store() {
  return createShareLinkStore(new Database(":memory:"));
}

function create(s, extra = {}) {
  return s.create({ uid: "u1", jobId: "job1", jobExpiresAt: JOB_EXPIRES, now: NOW, ...extra });
}

test("tokens are opaque, 256-bit, prefixed, and only their hash is stored", () => {
  const s = store();
  const db = new Database(":memory:");
  const s2 = createShareLinkStore(db);
  const { token, link } = s2.create({ uid: "u1", jobId: "job1", jobExpiresAt: JOB_EXPIRES, now: NOW });
  assert.ok(isWellFormedToken(token));
  assert.match(token, /^afs_[A-Za-z0-9_-]{43}$/);
  const row = db.prepare("SELECT * FROM share_links WHERE id = ?").get(link.id);
  assert.equal(row.token_hash, hashToken(token));
  assert.ok(!JSON.stringify(row).includes(token.slice(4)), "raw token must never be persisted");
  assert.notEqual(create(s).token, create(s).token);
});

test("default expiry is the master's expiry; custom expiry is capped by it", () => {
  const s = store();
  assert.equal(create(s).link.expires_at, JOB_EXPIRES);
  assert.equal(create(s, { expiresInSeconds: 3600 }).link.expires_at, new Date(NOW + HOUR).toISOString());
  assert.equal(create(s, { expiresInSeconds: 30 * 24 * 3600 }).link.expires_at, JOB_EXPIRES);
});

test("link resolves while active and stops exactly at expiry", () => {
  const s = store();
  const { token } = create(s, { expiresInSeconds: 3600 });
  assert.equal(s.resolve(token, NOW + HOUR - 1).status, "active");
  assert.equal(s.resolve(token, NOW + HOUR).status, "expired");
});

test("a master that already expired cannot be shared", () => {
  const s = store();
  assert.throws(() => create(s, { jobExpiresAt: new Date(NOW - 1).toISOString() }), (e) => e instanceof ShareLinkError && e.status === 410);
});

test("invalid parameters are rejected", () => {
  const s = store();
  assert.throws(() => create(s, { expiresInSeconds: MIN_EXPIRY_SECONDS - 1 }), (e) => e.status === 400);
  assert.throws(() => create(s, { expiresInSeconds: 1.5 * 3600 + 0.5 }), (e) => e.status === 400);
  assert.throws(() => create(s, { maxDownloads: 0 }), (e) => e.status === 400);
  assert.throws(() => create(s, { maxDownloads: "abc" }), (e) => e.status === 400);
});

test("revocation is immediate and scoped to the owner", () => {
  const s = store();
  const { token, link } = create(s);
  assert.equal(s.revoke("someone_else", link.id, NOW), false);
  assert.equal(s.resolve(token, NOW).status, "active");
  assert.equal(s.revoke("u1", link.id, NOW), true);
  assert.equal(s.resolve(token, NOW).status, "revoked");
  assert.equal(s.revoke("u1", link.id, NOW), false);
});

test("download limit is enforced atomically", () => {
  const s = store();
  const { token, link } = create(s, { maxDownloads: 2 });
  assert.equal(s.consumeDownload(link.id, NOW), true);
  assert.equal(s.consumeDownload(link.id, NOW), true);
  assert.equal(s.consumeDownload(link.id, NOW), false);
  assert.equal(s.resolve(token, NOW).status, "exhausted");
});

test("expired or revoked links cannot be consumed", () => {
  const s = store();
  const a = create(s, { expiresInSeconds: 3600 });
  assert.equal(s.consumeDownload(a.link.id, NOW + 2 * HOUR), false);
  const b = create(s);
  s.revoke("u1", b.link.id, NOW);
  assert.equal(s.consumeDownload(b.link.id, NOW), false);
});

test("malformed or unknown tokens resolve to not_found", () => {
  const s = store();
  for (const bad of [undefined, null, "", "afs_short", "x".repeat(47), `afs_${"A".repeat(43)}`]) {
    assert.equal(s.resolve(bad, NOW).status, "not_found");
  }
});

test("deleting a master revokes all of its links", () => {
  const s = store();
  const a = create(s);
  const b = create(s);
  const other = create(s, { jobId: "job2" });
  assert.equal(s.revokeAllForJob("u1", "job1", NOW), 2);
  assert.equal(s.resolve(a.token, NOW).status, "revoked");
  assert.equal(s.resolve(b.token, NOW).status, "revoked");
  assert.equal(s.resolve(other.token, NOW).status, "active");
});

test("active links per master are capped", () => {
  const s = store();
  for (let i = 0; i < MAX_ACTIVE_LINKS_PER_JOB; i += 1) create(s);
  assert.throws(() => create(s), (e) => e.status === 429);
  // Revoking frees a slot.
  s.revoke("u1", s.list("u1", "job1", NOW)[0].id, NOW);
  assert.doesNotThrow(() => create(s));
});

test("listing never exposes tokens and reports status", () => {
  const s = store();
  const { token } = create(s, { maxDownloads: 5 });
  const [item] = s.list("u1", "job1", NOW);
  assert.equal(item.status, "active");
  assert.equal(item.max_downloads, 5);
  assert.ok(!JSON.stringify(item).includes(token));
  assert.equal(s.list("u2", "job1", NOW).length, 0);
});

test("account deletion removes every link for the user", () => {
  const s = store();
  const { token } = create(s);
  create(s, { jobId: "job2" });
  assert.equal(s.deleteAllForUser("u1"), 2);
  assert.equal(s.resolve(token, NOW).status, "not_found");
});
