import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Env must be in place before settings.js / analyticsDb.js are loaded.
Object.assign(process.env, {
  POLAR_PLAN_STUDIO_PRODUCT_ID: "p_studio_m",
  POLAR_SINGLE_MASTER_PRODUCT_ID: "p_single",
  ANALYTICS_DB_PATH: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "meta-conversions-")), "analytics.db"),
});

const capi = await import("../metaCapiService.js");
const conversions = await import("../metaConversionsService.js");
const polar = await import("../polarService.js");
const { createFakeFirestore } = await import("./fakeFirestore.js");

let db;
let sent;
beforeEach(() => {
  Object.assign(process.env, { META_PIXEL_ID: "999", META_CAPI_TOKEN: "tok" });
  db = createFakeFirestore();
  conversions._setDepsForTests({ db });
  polar._setDepsForTests({ db, polar: {} });
  sent = [];
  capi._setFetchForTests(async (_url, init) => {
    sent.push(JSON.parse(init.body).data[0]);
    return { ok: true, status: 200, text: async () => "" };
  });
});
afterEach(() => {
  delete process.env.META_PIXEL_ID;
  delete process.env.META_CAPI_TOKEN;
  capi._setFetchForTests(null);
});

const ACCEPTED = { consent: "accepted", fbp: "fb.1.1760000000000.42", fbc: null };
const evt = (name, eventId, props = {}) => ({ name, props, ts: Date.now(), meta: { eventId, url: "https://auralithforge.app/pricing?token=secret" } });

// ---- /analytics/collect forwarding ------------------------------------------

test("collect: a mapped event is forwarded with the client's event_id when consent is accepted", async () => {
  const n = await conversions.forwardCollectEventsToMeta({
    events: [evt("pricing_view", "e-1"), evt("begin_checkout", "e-2", { value: 9.99 })],
    meta: ACCEPTED,
    ip: "203.0.113.9",
    userAgent: "UA",
  });
  assert.equal(n, 2);
  assert.deepEqual(
    sent.map((e) => [e.event_name, e.event_id]),
    [
      ["ViewContent", "e-1"],
      ["InitiateCheckout", "e-2"],
    ],
  );
  assert.deepEqual(sent[1].custom_data, { value: 9.99, currency: "EUR" });
  assert.equal(sent[0].event_source_url, "https://auralithforge.app/pricing", "query string stripped");
  assert.equal(sent[0].user_data.fbp, "fb.1.1760000000000.42");
});

test("collect: nothing is forwarded without accepted consent", async () => {
  for (const meta of [undefined, null, {}, { consent: "declined" }, { consent: "ACCEPTED" }]) {
    assert.equal(await conversions.forwardCollectEventsToMeta({ events: [evt("pricing_view", "e-1")], meta }), 0);
  }
  assert.equal(sent.length, 0);
});

test("collect: unmapped events and events without a valid event_id are never forwarded", async () => {
  const n = await conversions.forwardCollectEventsToMeta({
    events: [evt("page_view", "e-1"), evt("purchase", "e-2"), evt("download_clicked", "e-3"), evt("pricing_view", "bad id!"), { name: "pricing_view", props: {} }],
    meta: ACCEPTED,
  });
  assert.equal(n, 0);
  assert.equal(sent.length, 0);
});

test("collect: master_completed is forwarded only as the server-verified first master", async () => {
  db.store.set("users/u1", { firstMasterAt: new Date(), firstMasterJobId: "job1", firstMasterQualified: true });
  const forward = (props, uid = "u1") => conversions.forwardCollectEventsToMeta({ events: [evt("master_completed", `e-${Math.random()}`.replace(".", ""), props)], meta: ACCEPTED, uid });
  assert.equal(await forward({ first_master: true, job_id: "job2" }), 0, "wrong job");
  assert.equal(await forward({ job_id: "job1" }), 0, "not flagged first");
  assert.equal(await forward({ first_master: true, job_id: "job1" }, null), 0, "anonymous");
  assert.equal(await forward({ first_master: true, job_id: "job1" }), 1);
  assert.equal(sent[0].event_name, "FirstMasterCompleted");
});

test("first master: claimed once; a second completion never qualifies", async () => {
  db.store.set("users/u2", {});
  assert.equal(await conversions.claimFirstMaster("u2", "jobA"), true);
  assert.equal(await conversions.claimFirstMaster("u2", "jobB"), false);
  assert.equal(db.store.get("users/u2").firstMasterJobId, "jobA");
});

// ---- Polar webhook -> server-only Purchase ------------------------------------

function order(id, extra = {}) {
  return { id, productId: "p_single", totalAmount: 299, currency: "eur", customerId: "c1", customer: { externalId: "u1", email: "Buyer@Example.com" }, ...extra };
}

test("order.paid sends exactly one Purchase with Polar's real amount/currency and purchase_<id>; retries send nothing", async () => {
  db.store.set("users/u1", { metaAttribution: { consent: "accepted", fbp: "fb.1.1760000000000.42", fbc: null, ip: "203.0.113.9", userAgent: "UA" } });
  await polar.applyWebhookEvent({ type: "order.paid", data: order("ord_1") });
  await polar._settleMetaForTests();
  await polar.applyWebhookEvent({ type: "order.paid", data: order("ord_1") });
  await polar._settleMetaForTests();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event_name, "Purchase");
  assert.equal(sent[0].event_id, "purchase_ord_1");
  assert.equal(sent[0].custom_data.value, 2.99);
  assert.equal(sent[0].custom_data.currency, "EUR");
  assert.equal(sent[0].user_data.client_ip_address, "203.0.113.9");
  assert.equal(db.store.get("users/u1").extraMasterCredits, 1, "credit granted once");
});

test("subscription.created sends one Purchase; a redelivery sends nothing new", async () => {
  db.store.set("users/u1", { metaAttribution: { consent: "accepted", fbp: null, fbc: null, ip: "203.0.113.9", userAgent: "UA" } });
  const sub = { id: "sub_9", status: "active", productId: "p_studio_m", amount: 999, currency: "eur", customerId: "c1", customer: { externalId: "u1" }, currentPeriodEnd: new Date(Date.now() + 864e5), modifiedAt: new Date() };
  await polar.applyWebhookEvent({ type: "subscription.created", data: sub });
  await polar._settleMetaForTests();
  await polar.applyWebhookEvent({ type: "subscription.created", data: sub });
  await polar._settleMetaForTests();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event_id, "purchase_sub_9");
  assert.equal(sent[0].custom_data.value, 9.99);
});

test("without accepted consent the sale is still sent, anonymously, with no personal data", async () => {
  const attributions = [undefined, { consent: "declined", ip: "203.0.113.9", userAgent: "UA", fbp: "fb.1.1760000000000.42" }, { consent: "unknown" }];
  for (const [i, attribution] of attributions.entries()) {
    db.store.set("users/u1", attribution ? { metaAttribution: attribution, email: "buyer@example.com" } : { email: "buyer@example.com" });
    await polar.applyWebhookEvent({ type: "order.paid", data: order(`ord_anon_${i}`) });
    await polar._settleMetaForTests();
  }
  assert.equal(sent.length, 3);
  for (const e of sent) {
    assert.equal(e.event_name, "Purchase");
    assert.deepEqual(Object.keys(e.user_data), ["external_id"], "only the throwaway id");
    assert.match(e.event_id, /^anon_[0-9a-f-]{36}$/);
    assert.equal(e.action_source, "other");
    assert.equal(e.event_source_url, undefined);
    assert.deepEqual(e.custom_data, { value: 2.99, currency: "EUR", content_name: "Single Master (one-time)" });
    const raw = JSON.stringify(e);
    for (const leak of ["203.0.113.9", "UA", "fb.1", "buyer", "Buyer", "u1", "ord_anon", crypto.createHash("sha256").update("u1").digest("hex")]) {
      assert.ok(!raw.includes(leak), `anonymous Purchase leaked ${leak}`);
    }
  }
  assert.notEqual(sent[0].user_data.external_id[0], sent[1].user_data.external_id[0], "the throwaway id is never reused");
  assert.equal(db.store.get("metaPurchases/purchase_ord_anon_0").uid, undefined, "the anonymous marker keeps no uid");
});

test("an anonymous sale is not resent on webhook retry", async () => {
  db.store.set("users/u1", {});
  await polar.applyWebhookEvent({ type: "order.paid", data: order("ord_anon_retry") });
  await polar._settleMetaForTests();
  await polar.applyWebhookEvent({ type: "order.paid", data: order("ord_anon_retry") });
  await polar._settleMetaForTests();
  assert.equal(sent.length, 1);
});

test("checkout persists identifiers only with consent, wipes them otherwise", async () => {
  db.store.set("users/u3", {});
  await conversions.persistMetaAttribution("u3", { consent: "accepted", fbp: "fb.1.1760000000000.42", fbc: "garbage", ip: "203.0.113.9", userAgent: "UA" });
  assert.equal(db.store.get("users/u3").metaAttribution.fbp, "fb.1.1760000000000.42");
  assert.equal(db.store.get("users/u3").metaAttribution.fbc, null);
  await conversions.persistMetaAttribution("u3", { consent: "declined", fbp: "fb.1.1760000000000.42", ip: "203.0.113.9" });
  const stored = db.store.get("users/u3").metaAttribution;
  assert.equal(stored.consent, "declined");
  assert.equal(stored.fbp, null);
  assert.equal(stored.ip, null);
});

test("a failing Meta call never breaks the webhook", async () => {
  db.store.set("users/u1", { metaAttribution: { consent: "accepted", ip: "203.0.113.9", userAgent: "UA" } });
  const originalError = console.error;
  console.error = () => {};
  capi._setFetchForTests(async () => {
    throw new Error("network down");
  });
  try {
    await polar.applyWebhookEvent({ type: "order.paid", data: order("ord_fail") });
    await polar._settleMetaForTests();
    assert.equal(db.store.get("users/u1").extraMasterCredits, 1);
  } finally {
    console.error = originalError;
  }
});
