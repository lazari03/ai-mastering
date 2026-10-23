import test from "node:test";
import assert from "node:assert/strict";

import { isAnonymousToken } from "../auth.js";

test("anonymous Firebase tokens are recognised (and refused by requireAuth)", () => {
  assert.equal(isAnonymousToken({ firebase: { sign_in_provider: "anonymous" } }), true);
});

test("registered sign-in providers are not anonymous", () => {
  for (const provider of ["password", "google.com", undefined]) {
    assert.equal(isAnonymousToken({ firebase: { sign_in_provider: provider } }), false);
  }
  assert.equal(isAnonymousToken(undefined), false);
});
