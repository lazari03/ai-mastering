import { test } from "node:test";
import assert from "node:assert/strict";

import { reserveRenderSlots, releaseRenderSlots } from "../renderReservation.js";

// In-memory stand-in for entitlementsService with the same contract: every
// consume is one atomic check-and-decrement (Firestore runs it in a
// transaction), refunds clamp at zero, and each call yields to the event
// loop first so concurrent requests genuinely interleave like real ones.
function fakeEntitlements(start) {
  const s = { masterUsed: 0, masterLimit: 1, credits: 0, stemUsed: 0, stemLimit: 20, stemCredits: 0, ...start };
  const tick = () => new Promise((r) => setImmediate(r));
  const calls = [];
  const ent = {
    state: s,
    calls,
    async consumeMasterQuota(uid, limit) { await tick(); calls.push("consumeMasterQuota"); if (s.masterUsed >= limit) return false; s.masterUsed += 1; return true; },
    async consumeExtraCredit() { await tick(); calls.push("consumeExtraCredit"); if (s.credits <= 0) return false; s.credits -= 1; return true; },
    async consumeStemQuota() { await tick(); calls.push("consumeStemQuota"); if (s.stemUsed >= s.stemLimit) return false; s.stemUsed += 1; return true; },
    async consumeExtraStemCredit() { await tick(); calls.push("consumeExtraStemCredit"); if (s.stemCredits <= 0) return false; s.stemCredits -= 1; return true; },
    async refundMasterQuota() { await tick(); calls.push("refundMasterQuota"); s.masterUsed = Math.max(0, s.masterUsed - 1); return true; },
    async refundExtraCredit() { await tick(); calls.push("refundExtraCredit"); s.credits += 1; return true; },
    async refundStemQuota() { await tick(); calls.push("refundStemQuota"); s.stemUsed = Math.max(0, s.stemUsed - 1); return true; },
    async refundExtraStemCredit() { await tick(); calls.push("refundExtraStemCredit"); s.stemCredits += 1; return true; },
  };
  return ent;
}

const req = (needs, extra = {}) => ({ uid: "u1", plan: "pro", quotaLimit: 250, needs, ...extra });

test("concurrent stem renders with ONE stem credit: exactly one reserves, the loser keeps no master slot", async () => {
  const ent = fakeEntitlements({ masterLimit: 250, stemCredits: 1, stemUsed: 20 });
  const needs = { master: "quota", stem: "credit" };
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => reserveRenderSlots(req(needs), ent)));
  assert.equal(results.filter((r) => r.ok).length, 1, "one stem credit = one stem render");
  assert.equal(ent.state.stemCredits, 0);
  // Every loser gave its master slot back: only the winner's slot is spent.
  assert.equal(ent.state.masterUsed, 1);
  for (const r of results.filter((x) => !x.ok)) {
    assert.equal(r.failed, "stem");
    assert.deepEqual(r.reserved, { master: null, stem: null });
  }
});

test("concurrent masters with one slot left: exactly one renders (master gate unchanged)", async () => {
  const ent = fakeEntitlements({ masterLimit: 1 });
  const results = await Promise.all([1, 2, 3].map(() => reserveRenderSlots(req({ master: "quota", stem: null }, { quotaLimit: 1 }), ent)));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(ent.state.masterUsed, 1);
  assert.ok(results.filter((r) => !r.ok).every((r) => r.failed === "master"));
});

test("a failed render gives back exactly what was reserved (quota and credit paths)", async () => {
  for (const [needs, start, check] of [
    [{ master: "quota", stem: "quota" }, { masterLimit: 250 }, (s) => s.masterUsed === 0 && s.stemUsed === 0],
    [{ master: "credit", stem: "credit" }, { credits: 1, stemCredits: 1 }, (s) => s.credits === 1 && s.stemCredits === 1],
  ]) {
    const ent = fakeEntitlements(start);
    const r = await reserveRenderSlots(req(needs), ent);
    assert.equal(r.ok, true);
    const lost = await releaseRenderSlots({ uid: "u1", plan: "pro", reserved: r.reserved }, ent);
    assert.deepEqual(lost, []);
    assert.ok(check(ent.state), JSON.stringify(ent.state));
  }
});

test("stem separation that did not run refunds only the stem part; releasing twice never mints credit", async () => {
  const ent = fakeEntitlements({ masterLimit: 250, stemCredits: 1, stemUsed: 20 });
  const r = await reserveRenderSlots(req({ master: "quota", stem: "credit" }), ent);
  await releaseRenderSlots({ uid: "u1", plan: "pro", reserved: r.reserved, parts: ["stem"] }, ent);
  assert.equal(ent.state.stemCredits, 1, "stem credit back");
  assert.equal(ent.state.masterUsed, 1, "the delivered plain master is still billed");
  // A later catch-path release must not refund the stem a second time.
  await releaseRenderSlots({ uid: "u1", plan: "pro", reserved: r.reserved }, ent);
  assert.equal(ent.state.stemCredits, 1);
  assert.equal(ent.state.masterUsed, 0);
});

test("no stem requested: no stem counter is touched", async () => {
  const ent = fakeEntitlements({ masterLimit: 250 });
  const r = await reserveRenderSlots(req({ master: "quota", stem: null }), ent);
  assert.equal(r.ok, true);
  assert.deepEqual(ent.calls, ["consumeMasterQuota"]);
});

test("a refund that throws is reported as lost, never thrown over the real render error", async () => {
  const ent = fakeEntitlements({ masterLimit: 250 });
  const r = await reserveRenderSlots(req({ master: "quota", stem: null }), ent);
  ent.refundMasterQuota = async () => { throw new Error("firestore down"); };
  const lost = await releaseRenderSlots({ uid: "u1", plan: "pro", reserved: r.reserved }, ent);
  assert.deepEqual(lost, ["master"]);
});

test("a consume that throws fails closed (no render), it is not treated as available", async () => {
  const ent = fakeEntitlements({ masterLimit: 250, stemCredits: 1 });
  ent.consumeExtraStemCredit = async () => { throw new Error("firestore down"); };
  const r = await reserveRenderSlots(req({ master: "quota", stem: "credit" }), ent);
  assert.equal(r.ok, false);
  assert.equal(ent.state.masterUsed, 0, "master slot given back");
});
