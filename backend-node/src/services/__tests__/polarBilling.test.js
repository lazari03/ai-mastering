import { test } from "node:test";
import assert from "node:assert/strict";

// Product IDs must be in the environment before settings.js is loaded.
Object.assign(process.env, {
  POLAR_PLAN_INDIE_PRODUCT_ID: "p_indie_m",
  POLAR_PLAN_STUDIO_PRODUCT_ID: "p_studio_m",
  POLAR_PLAN_PRO_PRODUCT_ID: "p_pro_m",
  POLAR_PLAN_INDIE_ANNUAL_PRODUCT_ID: "p_indie_y",
  POLAR_PLAN_STUDIO_ANNUAL_PRODUCT_ID: "p_studio_y",
  POLAR_PLAN_PRO_ANNUAL_PRODUCT_ID: "p_pro_y",
});
const { subscriptionStatusFromUserData, planFromUserData } = await import("../polarService.js");

const active = (productId, extra = {}) => ({ subscription: { status: "active", productId, ...extra } });

test("yearly and monthly products map to the same plan, different billing", () => {
  for (const [id, plan, billing] of [
    ["p_indie_m", "indie", "monthly"],
    ["p_indie_y", "indie", "annual"],
    ["p_studio_m", "studio", "monthly"],
    ["p_studio_y", "studio", "annual"],
    ["p_pro_m", "pro", "monthly"],
    ["p_pro_y", "pro", "annual"],
  ]) {
    assert.equal(planFromUserData(active(id)), plan, id);
    assert.equal(subscriptionStatusFromUserData(active(id)).billing, billing, id);
  }
});

test("a scheduled monthly/yearly switch reports its target plan and billing", () => {
  const status = subscriptionStatusFromUserData(active("p_studio_y", { pendingProductId: "p_studio_m" }));
  assert.equal(status.pendingPlan, "studio");
  assert.equal(status.pendingBilling, "monthly");
});

test("no active subscription means no billing period", () => {
  assert.equal(subscriptionStatusFromUserData({}).billing, null);
  assert.equal(subscriptionStatusFromUserData({ subscription: { status: "canceled", productId: "p_pro_y" } }).billing, null);
});

test("plan changes charge now for upgrades and monthly->yearly, defer the rest", async () => {
  const { prorationForChange } = await import("../polarService.js");
  const cases = [
    ["planIndie", "planStudio", "invoice"],
    ["planStudio", "planProAnnual", "invoice"],
    ["planStudio", "planStudioAnnual", "invoice"],
    ["planStudioAnnual", "planStudio", "next_period"],
    ["planPro", "planStudio", "next_period"],
    ["planProAnnual", "planIndieAnnual", "next_period"],
    ["planStudioAnnual", "planPro", "invoice"],
  ];
  for (const [from, to, expected] of cases) assert.equal(prorationForChange(from, to), expected, `${from} -> ${to}`);
});
