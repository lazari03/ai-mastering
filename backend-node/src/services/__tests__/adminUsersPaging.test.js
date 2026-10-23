import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  project_id: "test-proj",
  private_key: privateKey,
  client_email: "t@test-proj.iam.gserviceaccount.com",
});

const { getAuth, getFirestore } = await import("../../config/firebase.js");
const { listUsers, MAX_AUTH_PAGES_PER_REQUEST } = await import("../adminUsersService.js");

test("admin user list walks at most MAX_AUTH_PAGES_PER_REQUEST Auth pages even if all are anonymous", async () => {
  const auth = getAuth();
  let calls = 0;
  auth.listUsers = async () => {
    calls += 1;
    return {
      users: Array.from({ length: 1000 }, (_, i) => ({ uid: `anon-${calls}-${i}`, providerData: [], metadata: {} })),
      pageToken: `tok-${calls}`,
    };
  };
  getFirestore().getAll = async () => [];

  const out = await listUsers({});
  assert.equal(calls, MAX_AUTH_PAGES_PER_REQUEST);
  assert.deepEqual(out.users, []);
  assert.equal(out.nextPageToken, `tok-${MAX_AUTH_PAGES_PER_REQUEST}`, "caller can resume from the cursor");

  calls = 0;
  await listUsers({ search: "nomatch" });
  assert.ok(calls <= MAX_AUTH_PAGES_PER_REQUEST);
});
