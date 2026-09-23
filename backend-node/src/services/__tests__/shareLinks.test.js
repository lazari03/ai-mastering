import { test } from "node:test";
import assert from "node:assert/strict";

import { isShareJobExpired, mintShareToken, verifyShareToken } from "../downloadTokenService.js";

test("share token verifies until the master's expiry, then stops", () => {
  const live = mintShareToken("u1", "job1", new Date(Date.now() + 60_000));
  assert.deepEqual(verifyShareToken(live), { uid: "u1", jobId: "job1" });
  const expired = mintShareToken("u1", "job1", new Date(Date.now() - 1_000));
  assert.equal(verifyShareToken(expired), null);
});

test("tampered share token is rejected", () => {
  const token = mintShareToken("u1", "job1", new Date(Date.now() + 60_000));
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(`u1.job2.${Date.now() + 60_000}`).toString("base64url");
  assert.equal(verifyShareToken(`${forged}.${sig}`), null);
  assert.equal(verifyShareToken(`${payload}.x${sig.slice(1)}`), null);
});

test("job expiry is enforced independently of the token", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  assert.equal(isShareJobExpired({ expires_at: "2026-01-01T13:00:00Z" }, now), false);
  assert.equal(isShareJobExpired({ expires_at: "2026-01-01T11:59:59Z" }, now), true);
  assert.equal(isShareJobExpired({ expires_at: { toDate: () => new Date("2026-01-02T00:00:00Z") } }, now), false);
  assert.equal(isShareJobExpired({}, now), true);
  assert.equal(isShareJobExpired(null, now), true);
});
