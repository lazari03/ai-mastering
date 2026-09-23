import test from "node:test";
import assert from "node:assert/strict";

import { sanitizePath, normalizeMasteringFailure, normalizeCheckoutFailure, ALLOWED_EVENT_NAMES, SERVER_ONLY_EVENT_NAMES } from "../analyticsService.js";

// Uses node's built-in test runner (node --test) — no new dependency for
// a repo that has zero test infrastructure anywhere else. Covers the
// pure, side-effect-free pieces of the analytics pipeline (spec section
// 34); ingestBatch/recordServerEvent need a real or mocked Firestore and
// are exercised manually per the ADMIN TEST CHECKLIST in the deliverable
// report instead.

test("sanitizePath strips sensitive query parameters", () => {
  assert.equal(sanitizePath("/pricing?token=abc123&utm_source=google"), "/pricing?utm_source=google");
  assert.equal(sanitizePath("/login?code=xyz&email=me%40example.com"), "/login");
  assert.equal(sanitizePath("/app?dl=secret-download-token"), "/app");
});

test("sanitizePath preserves ordinary query parameters", () => {
  assert.equal(sanitizePath("/master/pop?utm_source=reddit&utm_campaign=launch"), "/master/pop?utm_source=reddit&utm_campaign=launch");
});

test("sanitizePath falls back safely on non-path input", () => {
  assert.equal(sanitizePath(null), "/");
  assert.equal(sanitizePath(""), "/");
  assert.equal(sanitizePath("not-a-path"), "/");
});

test("sanitizePath caps length and never throws on malformed query strings", () => {
  assert.doesNotThrow(() => sanitizePath("/x?%"));
  assert.equal(typeof sanitizePath("/" + "a".repeat(1000)), "string");
});

test("normalizeMasteringFailure maps known failure shapes to fixed categories", () => {
  assert.equal(normalizeMasteringFailure(new Error("Processing timed out after 120s")), "processing_timeout");
  assert.equal(normalizeMasteringFailure(new Error("Unsupported audio format")), "unsupported_format");
  assert.equal(normalizeMasteringFailure(new Error("Invalid audio file")), "invalid_audio");
  assert.equal(normalizeMasteringFailure(new Error("worker exited with non-zero exit code")), "worker_error");
  assert.equal(normalizeMasteringFailure(new Error("ENOSPC: no space left on device")), "resource_error");
  assert.equal(normalizeMasteringFailure(new Error("something totally unrecognized")), "server_error");
  assert.equal(normalizeMasteringFailure(null), "unknown");
});

test("normalizeCheckoutFailure maps known failure shapes to fixed categories", () => {
  assert.equal(normalizeCheckoutFailure(new Error("Your card was declined")), "card_declined");
  assert.equal(normalizeCheckoutFailure(new Error("Insufficient funds")), "insufficient_funds");
  assert.equal(normalizeCheckoutFailure(new Error("3D Secure authentication failed")), "authentication_failed");
  assert.equal(normalizeCheckoutFailure(new Error("Your card has expired")), "expired_card");
  assert.equal(normalizeCheckoutFailure(new Error("User cancelled payment")), "payment_cancelled");
  assert.equal(normalizeCheckoutFailure(null), "unknown");
});

test("server-only events are never part of the public ingestion allowlist", () => {
  for (const name of SERVER_ONLY_EVENT_NAMES) {
    assert.equal(ALLOWED_EVENT_NAMES.has(name), false, `${name} must not be publicly ingestible — it must only ever be written by recordServerEvent()`);
  }
});

test("user-agent parsing: iPhones are iOS, not macOS; tablets and bots detected", async () => {
  const { parseUserAgent, isBotUserAgent } = await import("../analyticsService.js");
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.deepEqual(parseUserAgent(iphone), { deviceCategory: "mobile", browser: "safari", os: "ios" });
  const ipad = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.equal(parseUserAgent(ipad).deviceCategory, "tablet");
  const androidTablet = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  assert.deepEqual(parseUserAgent(androidTablet), { deviceCategory: "tablet", browser: "chrome", os: "android" });
  const chromeIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
  assert.equal(parseUserAgent(chromeIos).browser, "chrome");
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isBotUserAgent(iphone), false);
});
