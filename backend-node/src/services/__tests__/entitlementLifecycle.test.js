import { test } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, { POLAR_PLAN_PRO_PRODUCT_ID: "p_pro_m", POLAR_PLAN_STUDIO_PRODUCT_ID: "p_studio_m" });
const { isEntitled, planFromUserData } = await import("../polarService.js");

const DAY = 24 * 3600 * 1000;
const future = new Date(Date.now() + 10 * DAY).toISOString();
const past = new Date(Date.now() - DAY).toISOString();

// Cancellation and dunning: who keeps the €19.99 plan, and until when.
test("active subscription is entitled", () => {
  assert.equal(isEntitled({ status: "active", currentPeriodEnd: future }), true);
});

test("a cancellation scheduled for period end keeps access until then, not after", () => {
  assert.equal(isEntitled({ status: "canceled", currentPeriodEnd: future }), true);
  assert.equal(isEntitled({ status: "canceled", currentPeriodEnd: past }), false);
});

test("past_due (Polar still retrying payment) keeps access to period end", () => {
  assert.equal(isEntitled({ status: "past_due", currentPeriodEnd: future }), true);
});

test("an ENDED subscription (revoked, refunded, dunning exhausted) loses access immediately, even with a future period end", () => {
  assert.equal(isEntitled({ status: "canceled", currentPeriodEnd: future, endedAt: past }), false);
  assert.equal(isEntitled({ status: "unpaid", currentPeriodEnd: future }), false);
  assert.equal(isEntitled({ status: "incomplete_expired", currentPeriodEnd: future }), false);
});

test("no subscription, or one for an unknown product, is Free", () => {
  assert.equal(isEntitled(null), false);
  assert.equal(planFromUserData({}), "free");
  assert.equal(planFromUserData({ subscription: { status: "active", productId: "p_unknown", currentPeriodEnd: future } }), "free");
});

test("an ended All-Access subscription maps to Free, a live one to pro", () => {
  assert.equal(planFromUserData({ subscription: { status: "active", productId: "p_pro_m", currentPeriodEnd: future } }), "pro");
  assert.equal(planFromUserData({ subscription: { status: "canceled", productId: "p_pro_m", currentPeriodEnd: future, endedAt: past } }), "free");
});
