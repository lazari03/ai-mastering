import { test } from "node:test";
import assert from "node:assert/strict";
import { freeTrialLimit, FREE_TRIAL_CHANGED_AT } from "../freeTrialPolicy.js";
import { entitlementsFromUserData } from "../entitlementsService.js";
import { decideMasterCharge } from "../masterEntitlement.js";
import { createLedger, partsFor } from "../reservationLedger.js";
import { createFakeFirestore } from "./fakeFirestore.js";

test("new trial is one; old timestamps and legacy usage retain three", () => {
  assert.equal(freeTrialLimit({}), 1);
  assert.equal(freeTrialLimit({ createdAt: new Date(FREE_TRIAL_CHANGED_AT) }), 1);
  assert.equal(freeTrialLimit({ createdAt: { toDate: () => new Date(FREE_TRIAL_CHANGED_AT - 1) } }), 3);
  assert.equal(freeTrialLimit({ freeMasterUsage: { used: 2 } }), 3);
  assert.equal(freeTrialLimit({ freeMasterTrialLimit: 1, freeMasterUsage: { used: 0 } }), 1);
  assert.equal(freeTrialLimit({ freeMasterTrialLimit: 3 }), 3);
});

test("legacy allowance reaches the charge decision; exhausted new trial uses paid credits", () => {
  const old = entitlementsFromUserData({ freeMasterTrialLimit: 3, freeMasterUsage: { used: 1 } }, "free");
  const decision = decideMasterCharge({ plan: "free", snapshot: old });
  assert.equal(decision.quotaLimit, 3);
  assert.equal(decision.needs.master, "quota");
  const exhausted = entitlementsFromUserData({ freeMasterTrialLimit: 1, freeMasterUsage: { used: 1 } }, "free");
  assert.equal(decideMasterCharge({ plan: "free", snapshot: exhausted }).ok, false);
  const paid = entitlementsFromUserData({ freeMasterTrialLimit: 1, freeMasterUsage: { used: 1 }, extraMasterCredits: 1 }, "free");
  assert.equal(decideMasterCharge({ plan: "free", snapshot: paid }).needs.master, "credit");
  for (const [plan, limit] of [["indie", 15], ["studio", 50], ["pro", 250]]) {
    assert.equal(entitlementsFromUserData({}, plan).masterQuota.limit, limit);
  }
});

test("concurrent first renders reserve once, pin one-master allowance, and refund without granting legacy credits", async () => {
  const db = createFakeFirestore();
  const ledger = createLedger({ db });
  const parts = partsFor({ plan: "free", quotaLimit: 1, needs: { master: "quota", stem: null } });
  const results = await Promise.all([1, 2, 3].map((i) => ledger.reserve({ reservationId: `r${i}`, uid: "new", plan: "free", parts })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  let user = db.store.get("users/new");
  assert.equal(entitlementsFromUserData(user, "free").masterQuota.remaining, 0);
  const winner = results.findIndex((r) => r.ok) + 1;
  await ledger.refund(`r${winner}`, "failed");
  user = db.store.get("users/new");
  assert.equal(freeTrialLimit(user), 1);
  assert.equal(entitlementsFromUserData(user, "free").masterQuota.remaining, 1);
});

test("separation credit alone does not buy a full master after trial exhaustion", () => {
  const snapshot = entitlementsFromUserData({ freeMasterTrialLimit: 1, freeMasterUsage: { used: 1 }, extraStemCredits: 1 }, "free");
  assert.equal(decideMasterCharge({ plan: "free", snapshot, useStemSeparation: true }).ok, false);
  snapshot.extraCredits = 1;
  assert.deepEqual(decideMasterCharge({ plan: "free", snapshot, useStemSeparation: true }).needs, { master: "credit", stem: "credit" });
});
