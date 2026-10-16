import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Env must be in place before settings.js / analyticsDb.js are loaded.
Object.assign(process.env, {
  POLAR_PLAN_INDIE_PRODUCT_ID: "p_indie_m",
  POLAR_PLAN_STUDIO_PRODUCT_ID: "p_studio_m",
  POLAR_PLAN_PRO_PRODUCT_ID: "p_pro_m",
  POLAR_PLAN_INDIE_ANNUAL_PRODUCT_ID: "p_indie_y",
  POLAR_PLAN_STUDIO_ANNUAL_PRODUCT_ID: "p_studio_y",
  POLAR_PLAN_PRO_ANNUAL_PRODUCT_ID: "p_pro_y",
  ANALYTICS_DB_PATH: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "billing-analytics-")), "analytics.db"),
});

const polar = await import("../polarService.js");
const analytics = await import("../analyticsService.js");
const { default: analyticsDb } = await import("../../config/analyticsDb.js");
const { createFakeFirestore } = await import("./fakeFirestore.js");

const DAY = 24 * 60 * 60 * 1000;
const future = (days) => new Date(Date.now() + days * DAY);
const past = (days) => new Date(Date.now() - days * DAY);

function sub(id, status, modifiedAt, extra = {}) {
  return {
    id,
    status,
    productId: "p_studio_m",
    customerId: "c1",
    customer: { externalId: "u1" },
    currentPeriodEnd: future(20),
    endedAt: null,
    modifiedAt,
    ...extra,
  };
}

function setupPolar(user = {}, listed = []) {
  const db = createFakeFirestore();
  db.store.set("users/u1", user);
  polar._setDepsForTests({ db, polar: { subscriptions: { list: async () => ({ result: { items: listed } }) } } });
  return db;
}
const stored = (db) => db.store.get("users/u1").subscription;

// ---- BACKEND-009 (PAY-02) ------------------------------------------------

test("PAY-02: a late revoke for an OLD subscription id does not replace the current active one", async () => {
  const db = setupPolar();
  await polar.applyWebhookEvent({ type: "subscription.updated", data: sub("subB", "active", new Date("2026-10-10T00:00:00Z")) });
  await polar.applyWebhookEvent({
    type: "subscription.revoked",
    data: sub("subA", "canceled", new Date("2026-10-12T00:00:00Z"), { endedAt: past(5), currentPeriodEnd: past(5) }),
  });
  assert.equal(stored(db).polarSubscriptionId, "subB");
  assert.equal(polar.planFromUserData(db.store.get("users/u1")), "studio");
});

test("PAY-02: a NEW entitled subscription id still replaces an ended one, and same-id updates apply", async () => {
  const db = setupPolar({ subscription: { polarSubscriptionId: "subA", status: "canceled", productId: "p_studio_m", endedAt: past(2), modifiedAt: new Date("2026-10-01T00:00:00Z") } });
  await polar.applyWebhookEvent({ type: "subscription.created", data: sub("subB", "active", new Date("2026-10-02T00:00:00Z")) });
  assert.equal(stored(db).polarSubscriptionId, "subB");
  await polar.applyWebhookEvent({ type: "subscription.revoked", data: sub("subB", "canceled", new Date("2026-10-03T00:00:00Z"), { endedAt: past(1), currentPeriodEnd: past(1) }) });
  assert.equal(stored(db).status, "canceled");
  // and an older same-id event is still rejected by the timestamp guard
  await polar.applyWebhookEvent({ type: "subscription.updated", data: sub("subB", "active", new Date("2026-10-02T12:00:00Z")) });
  assert.equal(stored(db).status, "canceled");
});

// ---- BACKEND-010 (PAY-03) ------------------------------------------------

test("PAY-03: reconcile prefers the entitled subscription over a newer incomplete_expired one", async () => {
  const db = setupPolar({}, [
    sub("subNew", "incomplete_expired", new Date("2026-10-14T00:00:00Z"), { currentPeriodEnd: null }),
    sub("subOld", "active", new Date("2026-10-10T00:00:00Z")),
  ]);
  await polar.reconcileUserSubscription("u1");
  assert.equal(stored(db).polarSubscriptionId, "subOld");
  assert.equal(polar.planFromUserData(db.store.get("users/u1")), "studio");
});

test("PAY-03: reconcile never downgrades a stored active plan to a different non-entitled subscription", async () => {
  const db = setupPolar({ subscription: { polarSubscriptionId: "subOld", status: "active", productId: "p_studio_m", modifiedAt: new Date("2026-10-10T00:00:00Z"), currentPeriodEnd: future(20) } }, [
    sub("subNew", "incomplete_expired", new Date("2026-10-14T00:00:00Z"), { currentPeriodEnd: null }),
  ]);
  await polar.reconcileUserSubscription("u1");
  assert.equal(stored(db).polarSubscriptionId, "subOld");
});

test("PAY-03: a stale Polar list snapshot does not re-activate a revoked plan", async () => {
  const db = setupPolar(
    { subscription: { polarSubscriptionId: "subA", status: "canceled", productId: "p_studio_m", endedAt: past(1), currentPeriodEnd: past(1), modifiedAt: new Date("2026-10-12T00:00:00Z") } },
    [sub("subA", "active", new Date("2026-10-05T00:00:00Z"))],
  );
  await polar.reconcileUserSubscription("u1");
  assert.equal(stored(db).status, "canceled");
  assert.equal(polar.planFromUserData(db.store.get("users/u1")), "free");
});

test("PAY-03: reconcile still repairs a missed webhook (newer snapshot of the same subscription)", async () => {
  const db = setupPolar({ subscription: { polarSubscriptionId: "subA", status: "active", productId: "p_studio_m", modifiedAt: new Date("2026-10-05T00:00:00Z"), currentPeriodEnd: future(5) } }, [
    sub("subA", "canceled", new Date("2026-10-12T00:00:00Z"), { endedAt: past(1), currentPeriodEnd: past(1) }),
  ]);
  await polar.reconcileUserSubscription("u1");
  assert.equal(stored(db).status, "canceled");
});

// ---- ANALYTICS-001 / H-0017 ---------------------------------------------

const uuid = () => crypto.randomUUID();
const hasPaid = (sessionId) => analyticsDb.prepare("SELECT has_paid FROM analytics_sessions WHERE session_id = ?").get(sessionId).has_paid;

async function seedSession(uid) {
  const visitorId = uuid();
  const sessionId = uuid();
  await analytics.ingestBatch({ visitorId, sessionId, uid, ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", isNewSession: true, context: {}, events: [{ name: "page_view", path: "/pricing" }] });
  return { visitorId, sessionId };
}

test("ANALYTICS-001: payment_succeeded with only a uid marks the user's most recent session has_paid", async () => {
  analytics._setFirestoreForTests(createFakeFirestore());
  const uid = `payer-${uuid()}`;
  const older = await seedSession(uid);
  await new Promise((r) => setTimeout(r, 5));
  const newest = await seedSession(uid);
  const other = await seedSession(`other-${uuid()}`);
  await analytics.recordServerEvent("payment_succeeded", { uid, props: { plan: "subscription", amountCents: 1900, currency: "usd", kind: "subscription" } });
  assert.equal(hasPaid(newest.sessionId), 1);
  assert.equal(hasPaid(older.sessionId), 0);
  assert.equal(hasPaid(other.sessionId), 0);
  const ev = analyticsDb.prepare("SELECT session_id FROM analytics_events WHERE name = 'payment_succeeded' AND uid = ?").get(uid);
  assert.equal(ev.session_id, newest.sessionId);
});

// ---- SECURITY-011 --------------------------------------------------------

test("SECURITY-011: admin uid gets the same response shape as a normal visitor (no enumeration)", async () => {
  const db = createFakeFirestore();
  db.store.set("users/admin1", { role: "admin" });
  db.store.set("users/user1", { role: "user" });
  analytics._setFirestoreForTests(db);
  const events = [{ name: "page_view", path: "/" }, { name: "not_allowed" }];
  const call = (uid) => analytics.ingestBatch({ visitorId: uuid(), sessionId: uuid(), uid, ua: "Mozilla/5.0 Chrome/120", isNewSession: true, context: {}, events });
  const adminResult = await call("admin1");
  const userResult = await call("user1");
  assert.deepEqual(adminResult, userResult);
  assert.equal(adminResult.accepted, 1);
  // ...and nothing about the admin was stored
  assert.equal(analyticsDb.prepare("SELECT COUNT(*) AS n FROM analytics_sessions WHERE uid = 'admin1'").get().n, 0);
});

test("SECURITY-011: body uid is only honoured when a Bearer token verifies for that same uid", async () => {
  const verify = async (t) => {
    if (t === "good") return { uid: "u1" };
    throw new Error("bad token");
  };
  const r = (authHeader, bodyUid) => analytics.resolveCollectUid({ authHeader, bodyUid, verifyToken: verify });
  assert.equal(await r("Bearer good", "u1"), "u1");
  assert.equal(await r("Bearer good", "someone-else"), null); // spoofed uid
  assert.equal(await r("Bearer bad", "u1"), null);
  assert.equal(await r(undefined, "u1"), null); // no token = anonymous
  assert.equal(await r("Bearer good", undefined), null);
  assert.equal(await r("Bearer good", "x".repeat(200)), null);
});

// ---- funnel allowlist ----------------------------------------------------

test("funnel event names are accepted by the ingest allowlist and none are server-only", () => {
  for (const name of ["pricing_view", "signup_completed", "preset_applied", "preset_saved"]) {
    assert.equal(analytics.ALLOWED_EVENT_NAMES.has(name), true, name);
    assert.equal(analytics.SERVER_ONLY_EVENT_NAMES.has(name), false, name);
  }
});
