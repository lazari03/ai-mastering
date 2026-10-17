import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every limiter answers with a stable `code` the frontend localizes
// (masterError.rate_limited); detail stays as the English fallback.
test("all rate limiters carry code rate_limited", () => {
  const src = readFileSync(new URL("../rateLimit.js", import.meta.url), "utf8");
  const limiters = src.match(/export const \w+ = rateLimit\(/g) || [];
  const messages = src.match(/message: \{[^}]*\}/g) || [];
  assert.ok(limiters.length >= 7);
  assert.equal(messages.length, limiters.length);
  for (const m of messages) assert.match(m, /code: "rate_limited"/);
});
