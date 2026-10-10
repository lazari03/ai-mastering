import { test } from "node:test";
import assert from "node:assert/strict";

import { createLedger, partsFor, RESERVATIONS } from "../reservationLedger.js";
import { createFakeFirestore } from "./fakeFirestore.js";

const MONTH = new Date("2026-10-15T12:00:00Z");
const NEXT_MONTH = new Date("2026-11-01T00:05:00Z");

function setup({ user = {}, at = MONTH } = {}) {
  const db = createFakeFirestore();
  db.store.set("users/u1", user);
  const clock = { t: at };
  const ledger = createLedger({ db, now: () => clock.t, leaseMs: 25 * 60 * 1000 });
  const userDoc = () => db.store.get("users/u1");
  const res = (id) => db.store.get(`${RESERVATIONS}/${id}`);
  return { db, ledger, clock, userDoc, res };
}

const proQuota = (n = 250) => partsFor({ plan: "pro", quotaLimit: n, needs: { master: "quota", stem: null }, stemLimit: 20 });
const proWithStemCredit = () => partsFor({ plan: "pro", quotaLimit: 250, needs: { master: "quota", stem: "credit" }, stemLimit: 20 });

// ---- reservation + concurrency ------------------------------------------

test("five concurrent requests with ONE remaining master: exactly one is reserved", async () => {
  const { ledger, userDoc } = setup({ user: { masterQuota: { month: "2026-10", used: 249 } } });
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => ledger.reserve({ reservationId: `r${i}`, uid: "u1", plan: "pro", jobId: `j${i}`, parts: proQuota() })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(userDoc().masterQuota, { month: "2026-10", used: 250 });
});

test("five concurrent stem renders with ONE stem credit: one runs, losers hold nothing", async () => {
  const { ledger, userDoc, db } = setup({ user: { extraStemCredits: 1 } });
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => ledger.reserve({ reservationId: `s${i}`, uid: "u1", plan: "pro", jobId: `j${i}`, parts: proWithStemCredit() })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(userDoc().extraStemCredits, 0);
  // all-or-nothing: the losers' master slots were never taken
  assert.equal(userDoc().masterQuota.used, 1);
  assert.equal([...db.store.keys()].filter((k) => k.startsWith(RESERVATIONS)).length, 1);
});

test("reserving the same id twice (client retry) charges once", async () => {
  const { ledger, userDoc } = setup();
  const a = await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  const b = await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  assert.ok(a.ok && b.ok && b.existing);
  assert.equal(userDoc().masterQuota.used, 1);
});

test("another user can't reuse a reservation id", async () => {
  const { ledger } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  await assert.rejects(ledger.reserve({ reservationId: "r1", uid: "u2", plan: "pro", jobId: "j1", parts: proQuota() }), /another user/);
});

// ---- failure paths ---------------------------------------------------------

test("failure before processing refunds everything", async () => {
  const { ledger, userDoc, res } = setup({ user: { extraStemCredits: 1 } });
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proWithStemCredit() });
  const out = await ledger.refund("r1", "upload rejected");
  assert.ok(out.ok);
  assert.equal(userDoc().masterQuota.used, 0);
  assert.equal(userDoc().extraStemCredits, 1);
  assert.equal(res("r1").state, "refunded");
  assert.equal(res("r1").leaseExpiresAt, null);
});

test("failure during processing refunds; a second refund is a no-op (no minted credit)", async () => {
  const { ledger, userDoc } = setup({ user: { extraMasterCredits: 1 } });
  const parts = partsFor({ plan: "free", quotaLimit: 3, needs: { master: "credit", stem: null } });
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "free", jobId: "j1", parts });
  await ledger.markProcessing("r1");
  assert.ok((await ledger.refund("r1", "render failed")).ok);
  assert.equal((await ledger.refund("r1", "duplicate callback")).ok, false);
  assert.equal(userDoc().extraMasterCredits, 1);
});

test("Firestore outage during refund: nothing is lost — the lease brings it back", async () => {
  const { ledger, userDoc, db, clock, res } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  await ledger.markProcessing("r1");
  db.failNext(1);
  await assert.rejects(ledger.refund("r1", "render failed"), /UNAVAILABLE/);
  assert.equal(userDoc().masterQuota.used, 1, "still charged while Firestore is down");
  assert.equal(res("r1").state, "processing");
  clock.t = new Date(MONTH.getTime() + 26 * 60 * 1000);
  const summary = await ledger.reconcileAbandoned({ jobDelivered: async () => false });
  assert.equal(summary.refunded, 1);
  assert.equal(userDoc().masterQuota.used, 0);
});

test("worker/gateway crash: an abandoned reservation is refunded, and upstream work is stopped", async () => {
  const { ledger, userDoc, clock } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "job-1", parts: proQuota() });
  await ledger.markProcessing("r1");
  // (process dies here: no complete, no refund)
  clock.t = new Date(MONTH.getTime() + 10 * 60 * 1000);
  assert.equal((await ledger.reconcileAbandoned()).examined, 0, "a live lease is never reconciled");
  clock.t = new Date(MONTH.getTime() + 26 * 60 * 1000);
  const cancelled = [];
  const summary = await ledger.reconcileAbandoned({ jobDelivered: async () => false, onAbandoned: async (jobId) => cancelled.push(jobId) });
  assert.equal(summary.refunded, 1);
  assert.deepEqual(cancelled, ["job-1"]);
  assert.equal(userDoc().masterQuota.used, 0);
});

test("retry after a restart: a reservation whose job WAS delivered is completed, never refunded", async () => {
  const { ledger, userDoc, clock, res } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "job-1", parts: proQuota() });
  await ledger.markProcessing("r1");
  clock.t = new Date(MONTH.getTime() + 26 * 60 * 1000);
  const summary = await ledger.reconcileAbandoned({ jobDelivered: async (uid, jobId) => uid === "u1" && jobId === "job-1" });
  assert.equal(summary.completed, 1);
  assert.equal(res("r1").state, "completed");
  assert.equal(userDoc().masterQuota.used, 1);
});

test("two reconcilers at once settle each reservation exactly once", async () => {
  const { ledger, userDoc, clock } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  clock.t = new Date(MONTH.getTime() + 26 * 60 * 1000);
  const [a, b] = await Promise.all([ledger.reconcileAbandoned(), ledger.reconcileAbandoned()]);
  assert.equal(a.refunded + b.refunded, 1);
  assert.equal(userDoc().masterQuota.used, 0);
});

// ---- races -------------------------------------------------------------------

test("cancellation and completion racing: the first terminal transition wins, the other is a no-op", async () => {
  for (const order of [["complete", "refund"], ["refund", "complete"]]) {
    const { ledger, userDoc, res } = setup();
    await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
    await ledger.markProcessing("r1");
    const [first, second] = await Promise.all(order.map((op) => (op === "complete" ? ledger.complete("r1") : ledger.refund("r1", "cancelled"))));
    assert.ok(first.ok && !second.ok, order.join(" vs "));
    const winner = order[0] === "complete" ? "completed" : "refunded";
    assert.equal(res("r1").state, winner);
    assert.equal(userDoc().masterQuota.used, winner === "completed" ? 1 : 0, "a delivered master is never refunded");
  }
});

test("a stale worker can't complete a job that was already refunded", async () => {
  const { ledger } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  await ledger.refund("r1", "timed out");
  const late = await ledger.complete("r1");
  assert.equal(late.ok, false);
  assert.equal(late.state, "refunded", "the route must not deliver this result");
});

test("stem separation that didn't run: master kept, stem refunded, in one step", async () => {
  const { ledger, userDoc, res } = setup({ user: { extraStemCredits: 2 } });
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proWithStemCredit() });
  await ledger.markProcessing("r1");
  await ledger.complete("r1", { refundStem: true });
  assert.equal(userDoc().masterQuota.used, 1);
  assert.equal(userDoc().extraStemCredits, 2);
  assert.equal(res("r1").parts.master.status, "kept");
  assert.equal(res("r1").parts.stem.status, "refunded");
});

// ---- month boundary --------------------------------------------------------

test("month boundary: a slot reserved in October is not refunded into November (no minted master)", async () => {
  const { ledger, userDoc, clock, res } = setup({ user: { masterQuota: { month: "2026-10", used: 249 } } });
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  clock.t = NEXT_MONTH;
  // November: the user starts a fresh month with one master already used
  await ledger.reserve({ reservationId: "r2", uid: "u1", plan: "pro", jobId: "j2", parts: proQuota() });
  await ledger.refund("r1", "render failed across midnight");
  assert.deepEqual(userDoc().masterQuota, { month: "2026-11", used: 1 }, "November's count is untouched");
  assert.equal(res("r1").parts.master.status, "expired");
});

test("month-boundary recovery: an abandoned October reservation reconciled in November mints nothing", async () => {
  const { ledger, userDoc, clock } = setup();
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proQuota() });
  clock.t = NEXT_MONTH;
  await ledger.reconcileAbandoned();
  assert.deepEqual(userDoc().masterQuota, { month: "2026-10", used: 1 }, "October's record is left as history");
});

test("credits and the Free lifetime trial refund across a month boundary (they never reset)", async () => {
  const { ledger, userDoc, clock } = setup({ user: { freeMasterUsage: { used: 2 }, extraStemCredits: 1 } });
  const parts = partsFor({ plan: "free", quotaLimit: 3, needs: { master: "quota", stem: "credit" }, stemLimit: 20 });
  await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "free", jobId: "j1", parts });
  clock.t = NEXT_MONTH;
  await ledger.refund("r1", "failed");
  assert.deepEqual(userDoc().freeMasterUsage, { used: 2 });
  assert.equal(userDoc().extraStemCredits, 1);
});

test("Free trial exhausted is refused; existing balances are read as-is (no migration)", async () => {
  const { ledger } = setup({ user: { freeMasterUsage: { used: 3 }, unrelatedField: "kept" } });
  const r = await ledger.reserve({ reservationId: "r1", uid: "u1", plan: "free", jobId: "j1", parts: partsFor({ plan: "free", quotaLimit: 3, needs: { master: "quota", stem: null } }) });
  assert.equal(r.ok, false);
  assert.equal(r.failed, "master");
});

test("a reserve that fails mid-transaction leaves no partial charge", async () => {
  const { ledger, db, userDoc } = setup({ user: { extraStemCredits: 1 } });
  db.failNext(3); // the transaction's reads/commit fail
  await assert.rejects(ledger.reserve({ reservationId: "r1", uid: "u1", plan: "pro", jobId: "j1", parts: proWithStemCredit() }));
  assert.equal(userDoc().extraStemCredits, 1);
  assert.equal(userDoc().masterQuota, undefined);
});
