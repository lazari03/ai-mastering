import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.DOWNLOAD_TOKEN_SECRET = "test-secret-for-lifecycle-emails";

const lifecycle = await import("../lifecycleEmailService.js");
const { createFakeFirestore } = await import("./fakeFirestore.js");

let db;
let sent;
function install({ enabled = true, ok = true } = {}) {
  db = createFakeFirestore();
  sent = [];
  lifecycle._setDepsForTests({
    db,
    enabled,
    auth: { getUser: async () => ({ email: "from-auth@example.com" }) },
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok, status: ok ? 201 : 500, text: async () => "" };
    },
  });
}
beforeEach(() => install());

test("unsubscribe token round-trips and rejects tampering", () => {
  const token = lifecycle.mintUnsubscribeToken("uid_1");
  assert.equal(lifecycle.verifyUnsubscribeToken(token), "uid_1");
  const [, sig] = token.split(".");
  assert.equal(lifecycle.verifyUnsubscribeToken(`${Buffer.from("uid_2").toString("base64url")}.${sig}`), null);
  assert.equal(lifecycle.verifyUnsubscribeToken("garbage"), null);
  assert.equal(lifecycle.verifyUnsubscribeToken(""), null);
  assert.equal(lifecycle.verifyUnsubscribeToken(undefined), null);
});

test("every template has a subject, an unsubscribe link and UTM-tagged CTA; unknown type builds nothing", () => {
  for (const type of lifecycle.LIFECYCLE_TYPES) {
    const built = lifecycle.buildLifecycleEmail(type, { uid: "u1", firstName: "Ana", freeMastersLeft: 2, productLabel: "the Indie plan" });
    assert.ok(built.subject.length > 10, type);
    assert.ok(built.htmlContent.includes("/email/unsubscribe?token="), type);
    assert.ok(built.htmlContent.includes(`utm_campaign=${type}`), type);
    assert.ok(built.htmlContent.includes("Hey Ana,"), type);
  }
  assert.equal(lifecycle.buildLifecycleEmail("nope", { uid: "u1" }), null);
});

test("first name is HTML-escaped", () => {
  const built = lifecycle.buildLifecycleEmail("first_master", { uid: "u1", firstName: "<script>x</script>" });
  assert.ok(!built.htmlContent.includes("<script>"));
  assert.ok(built.htmlContent.includes("&lt;script&gt;"));
});

test("first_master states the remaining free masters, singular and plural", () => {
  const two = lifecycle.buildLifecycleEmail("first_master", { uid: "u", freeMastersLeft: 2 }).htmlContent;
  const one = lifecycle.buildLifecycleEmail("first_master", { uid: "u", freeMastersLeft: 1 }).htmlContent;
  const none = lifecycle.buildLifecycleEmail("first_master", { uid: "u", freeMastersLeft: null }).htmlContent;
  assert.ok(two.includes("2 free full-length masters"));
  assert.ok(one.includes("1 free full-length master "));
  assert.ok(!none.includes("free full-length master"));
});

test("sends once per account per type", async () => {
  assert.equal(await lifecycle.sendLifecycleEmail("first_master", { uid: "u1", email: "a@example.com" }), "sent");
  assert.equal(await lifecycle.sendLifecycleEmail("first_master", { uid: "u1", email: "a@example.com" }), "skipped");
  assert.equal(await lifecycle.sendLifecycleEmail("trial_exhausted", { uid: "u1", email: "a@example.com" }), "sent");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to[0].email, "a@example.com");
  assert.ok(sent[0].headers["List-Unsubscribe"].includes("/email/unsubscribe?token="));
});

test("concurrent sends for the same account and type deliver exactly one email", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => lifecycle.sendLifecycleEmail("trial_exhausted", { uid: "u1", email: "a@example.com" }))
  );
  assert.equal(results.filter((r) => r === "sent").length, 1);
  assert.equal(sent.length, 1);
});

test("opted-out accounts are never emailed", async () => {
  await lifecycle.optOut("u1");
  assert.equal(await lifecycle.sendLifecycleEmail("first_master", { uid: "u1", email: "a@example.com" }), "skipped");
  assert.equal(sent.length, 0);
});

test("disabled flag sends nothing and claims nothing", async () => {
  install({ enabled: false });
  assert.equal(await lifecycle.sendLifecycleEmail("first_master", { uid: "u1", email: "a@example.com" }), "disabled");
  assert.equal(sent.length, 0);
  assert.equal(db.store.has("users/u1"), false);
});

test("falls back to the profile email, then Firebase Auth", async () => {
  await db.collection("users").doc("u1").set({ email: "profile@example.com", firstName: "Ana" });
  await lifecycle.sendLifecycleEmail("first_master", { uid: "u1" });
  assert.equal(sent[0].to[0].email, "profile@example.com");
  assert.ok(sent[0].htmlContent.includes("Hey Ana,"));
  await lifecycle.sendLifecycleEmail("first_master", { uid: "u2" });
  assert.equal(sent[1].to[0].email, "from-auth@example.com");
});

test("a Brevo failure is reported, not thrown", async () => {
  install({ ok: false });
  assert.equal(await lifecycle.sendLifecycleEmail("first_master", { uid: "u1", email: "a@example.com" }), "failed");
});

test("abandoned checkout: reminds after an hour, once, and not after payment or when stale", async () => {
  const t0 = Date.UTC(2026, 10, 14, 12, 0, 0);
  const ago = (ms) => new Date(t0 - ms);
  const users = db.collection("users");
  await users.doc("recent").set({ email: "recent@example.com", pendingCheckoutAt: ago(10 * 60 * 1000), pendingCheckoutProduct: "planIndie" });
  await users.doc("due").set({ email: "due@example.com", pendingCheckoutAt: ago(2 * 60 * 60 * 1000), pendingCheckoutProduct: "planIndie" });
  await users.doc("stale").set({ email: "stale@example.com", pendingCheckoutAt: ago(5 * 24 * 60 * 60 * 1000), pendingCheckoutProduct: "planStudio" });
  await users.doc("paid").set({ email: "paid@example.com", pendingCheckoutAt: ago(2 * 60 * 60 * 1000), pendingCheckoutProduct: "singleMaster" });
  await lifecycle.clearPendingCheckout("paid", db); // what the payment webhook does

  const first = await lifecycle.sweepAbandonedCheckouts({ now: () => t0 });
  assert.equal(first.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, "due@example.com");
  assert.ok(sent[0].htmlContent.includes("the Indie plan"));
  assert.equal(db.store.get("users/recent").pendingCheckoutAt instanceof Date, true, "recent checkout is left for a later sweep");
  assert.equal(db.store.get("users/stale").pendingCheckoutAt, null, "stale marker is cleared without emailing");

  const second = await lifecycle.sweepAbandonedCheckouts({ now: () => t0 });
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 1);

  // A second abandoned checkout later on never emails the same account twice.
  await users.doc("due").set({ pendingCheckoutAt: ago(3 * 60 * 60 * 1000), pendingCheckoutProduct: "planStudio" }, { merge: true });
  assert.equal((await lifecycle.sweepAbandonedCheckouts({ now: () => t0 })).sent, 0);
});

test("markCheckoutStarted stamps the user doc", async () => {
  await lifecycle.markCheckoutStarted("u1", "planStudio");
  const data = db.store.get("users/u1");
  assert.ok(data.pendingCheckoutAt instanceof Date);
  assert.equal(data.pendingCheckoutProduct, "planStudio");
});
