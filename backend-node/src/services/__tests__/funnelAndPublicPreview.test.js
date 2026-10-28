import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Env must be in place before settings.js / analyticsDb.js are loaded.
Object.assign(process.env, {
  ANALYTICS_DB_PATH: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "funnel-")), "analytics.db"),
});

const analytics = await import("../analyticsService.js");
const query = await import("../analyticsQueryService.js");
const { default: analyticsDb } = await import("../../config/analyticsDb.js");
const { createFakeFirestore } = await import("./fakeFirestore.js");
const { mintPublicPreviewToken, verifyPublicPreviewToken, verifyShareToken, verifyDownloadToken } = await import("../downloadTokenService.js");
const { createPreviewBudget } = await import("../publicPreviewBudget.js");

analytics._setFirestoreForTests(createFakeFirestore());

const uuid = () => crypto.randomUUID();
const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/120";
const session = (sessionId) => analyticsDb.prepare("SELECT * FROM analytics_sessions WHERE session_id = ?").get(sessionId);

// ---- Session flags --------------------------------------------------------

test("sessionFlagsForEvent: the demo sample is not an upload, the visitor's own file is", () => {
  assert.deepEqual(analytics.sessionFlagsForEvent("free_tool_analysis_completed", { input: "sample" }), {});
  assert.equal(analytics.sessionFlagsForEvent("free_tool_analysis_completed", { input: "upload", method: "browser" }).has_uploaded, 1);
  assert.equal(analytics.sessionFlagsForEvent("public_preview_started", {}).has_uploaded, 1);
});

test("sessionFlagsForEvent: a 30 s preview is 'heard preview', never 'mastered'", () => {
  assert.deepEqual(analytics.sessionFlagsForEvent("master_completed", { preview: true }), { has_previewed: 1 });
  assert.deepEqual(analytics.sessionFlagsForEvent("master_completed", { preview: false }), { has_mastered: 1 });
  assert.deepEqual(analytics.sessionFlagsForEvent("public_preview_completed", {}), { has_previewed: 1 });
  assert.deepEqual(analytics.sessionFlagsForEvent("signup_completed", { method: "google" }), { has_signed_up: 1 });
});

test("the new funnel events are accepted from the browser", () => {
  for (const name of ["public_preview_started", "public_preview_completed", "public_preview_failed", "email_verified"]) {
    assert.equal(analytics.ALLOWED_EVENT_NAMES.has(name), true, name);
    assert.equal(analytics.SERVER_ONLY_EVENT_NAMES.has(name), false, name);
  }
});

// ---- authenticated follows the uid mid-session ---------------------------

test("a session that signs up mid-way becomes authenticated and counts as a signup", async () => {
  const visitorId = uuid();
  const sessionId = uuid();
  // First batch: anonymous visitor on the homepage.
  await analytics.ingestBatch({ visitorId, sessionId, uid: null, ua: UA, isNewSession: true, context: {}, events: [{ name: "page_view", path: "/" }] });
  assert.equal(session(sessionId).authenticated, 0);
  // Later batch in the same session, after signing up (verified uid).
  await analytics.ingestBatch({
    visitorId,
    sessionId,
    uid: "user-mid-session",
    ua: UA,
    isNewSession: false,
    context: {},
    events: [{ name: "signup_completed", props: { method: "password" } }],
  });
  const row = session(sessionId);
  assert.equal(row.authenticated, 1);
  assert.equal(row.uid, "user-mid-session");
  assert.equal(row.has_signed_up, 1);
});

test("a signed-out preview session lands on the preview step, not the master step", async () => {
  const visitorId = uuid();
  const sessionId = uuid();
  await analytics.ingestBatch({
    visitorId,
    sessionId,
    uid: null,
    ua: UA,
    isNewSession: true,
    context: {},
    events: [
      { name: "page_view", path: "/" },
      { name: "public_preview_started", props: {} },
      { name: "public_preview_completed", props: {} },
      { name: "master_completed", props: { preview: true } },
    ],
  });
  const row = session(sessionId);
  assert.equal(row.has_uploaded, 1);
  assert.equal(row.has_previewed, 1);
  assert.equal(row.has_mastered, 0);
});

test("getFunnel reports upload → preview → signup → master in product order", async () => {
  const now = new Date();
  const steps = await query.getFunnel({ from: new Date(now.getTime() - 60 * 60 * 1000), to: new Date(now.getTime() + 60 * 1000), filters: {} });
  assert.deepEqual(
    steps.map((s) => s.key),
    ["visitors", "upload", "preview", "signup", "master", "pricing", "checkout", "paid"],
  );
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s.count]));
  assert.ok(byKey.preview >= 1);
  assert.ok(byKey.signup >= 1);
});

test("a server-observed checkout_started lights up the uid's latest session", async () => {
  const visitorId = uuid();
  const sessionId = uuid();
  await analytics.ingestBatch({ visitorId, sessionId, uid: "buyer-1", ua: UA, isNewSession: true, context: {}, events: [{ name: "page_view", path: "/app" }] });
  await analytics.recordServerEvent("checkout_started", { uid: "buyer-1", props: { plan: "planIndie" } });
  assert.equal(session(sessionId).has_started_checkout, 1);
});

// ---- Public preview token -------------------------------------------------

test("public preview token: valid only for its own job and until it expires", () => {
  const now = Date.now();
  const token = mintPublicPreviewToken("job123abc", now);
  assert.equal(verifyPublicPreviewToken(token, "job123abc", now), true);
  assert.equal(verifyPublicPreviewToken(token, "otherjob99", now), false);
  assert.equal(verifyPublicPreviewToken(token, "job123abc", now + 3 * 60 * 60 * 1000), false);
  assert.equal(verifyPublicPreviewToken(`${token}x`, "job123abc", now), false);
  assert.equal(verifyPublicPreviewToken("", "job123abc", now), false);
});

test("public preview token never verifies as a share or download token", () => {
  const token = mintPublicPreviewToken("job123abc");
  assert.equal(verifyShareToken(token), null);
  assert.equal(verifyDownloadToken(token), null);
});

// ---- Site-wide preview budget --------------------------------------------

test("preview budget: caps per window, frees slots as the window slides, release gives one back", () => {
  let clock = 0;
  const budget = createPreviewBudget({ limit: 2, windowMs: 1000, now: () => clock });
  assert.equal(budget.tryTake(), true);
  assert.equal(budget.tryTake(), true);
  assert.equal(budget.tryTake(), false);
  budget.release();
  assert.equal(budget.tryTake(), true);
  clock = 1001;
  assert.equal(budget.remaining(), 2);
  assert.equal(budget.tryTake(), true);
});

test("preview budget: a zero/unset limit disables signed-out previews", () => {
  const budget = createPreviewBudget({ limit: 0 });
  assert.equal(budget.tryTake(), false);
});
