import test from "node:test";
import assert from "node:assert/strict";

import { firstOrigin } from "../settings.js";

test("firstOrigin returns a single origin unchanged (minus trailing slash)", () => {
  assert.equal(firstOrigin("https://auralithforge.app"), "https://auralithforge.app");
  assert.equal(firstOrigin("https://auralithforge.app/"), "https://auralithforge.app");
});

test("firstOrigin uses the first trimmed entry of a comma-separated list", () => {
  assert.equal(firstOrigin(" https://auralithforge.app , https://www.auralithforge.app"), "https://auralithforge.app");
  assert.equal(firstOrigin(",https://a.example"), "https://a.example");
});

test("firstOrigin is null when unset or blank", () => {
  assert.equal(firstOrigin(undefined), null);
  assert.equal(firstOrigin(" , "), null);
});
