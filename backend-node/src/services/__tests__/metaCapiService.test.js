import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const capi = await import("../metaCapiService.js");

const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const ENV_KEYS = ["META_PIXEL_ID", "META_CAPI_TOKEN", "META_TEST_EVENT_CODE"];

function setEnv(values) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}
function captureFetch(response = { ok: true, status: 200, text: async () => "" }) {
  const calls = [];
  capi._setFetchForTests(async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return response;
  });
  return calls;
}
afterEach(() => {
  setEnv({});
  capi._setFetchForTests(null);
});

const event = {
  eventName: "CompleteRegistration",
  eventId: "evt-1",
  eventTime: 1_760_000_000_000,
  eventSourceUrl: "https://auralithforge.app/app",
  user: { email: "  Fonsi@Example.COM ", uid: "uid-123", ip: "203.0.113.9", userAgent: "UA/1.0", fbp: "fb.1.1760000000000.123456", fbc: "fb.1.1760000000000.AbC_dEf" },
  customData: { status: "completed" },
};

test("email is trimmed + lowercased before SHA-256, uid is hashed, ip/ua/fbp/fbc go unhashed", () => {
  const userData = capi.buildUserData(event.user);
  assert.deepEqual(userData.em, [sha("fonsi@example.com")]);
  assert.deepEqual(userData.external_id, [sha("uid-123")]);
  assert.equal(userData.client_ip_address, "203.0.113.9");
  assert.equal(userData.client_user_agent, "UA/1.0");
  assert.equal(userData.fbp, "fb.1.1760000000000.123456");
  assert.equal(userData.fbc, "fb.1.1760000000000.AbC_dEf");
  assert.ok(!JSON.stringify(userData).includes("example.com"), "raw email must never be sent");
  assert.ok(!JSON.stringify(userData).includes("uid-123"), "raw uid must never be sent");
});

test("malformed fbp/fbc and non-emails are dropped", () => {
  const userData = capi.buildUserData({ email: "not-an-email", fbp: "evil<script>", fbc: "fb.1.x.y" });
  assert.equal(userData.em, undefined);
  assert.equal(userData.fbp, undefined);
  assert.equal(userData.fbc, undefined);
});

test("payload shape matches the CAPI events endpoint", async () => {
  setEnv({ META_PIXEL_ID: "999", META_CAPI_TOKEN: "tok" });
  const calls = captureFetch();
  assert.equal(await capi.sendMetaEvent(event), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://graph.facebook.com/${capi.META_GRAPH_API_VERSION}/999/events?access_token=tok`);
  assert.equal(calls[0].init.method, "POST");
  const [sent] = calls[0].body.data;
  assert.equal(sent.event_name, "CompleteRegistration");
  assert.equal(sent.event_id, "evt-1");
  assert.equal(sent.event_time, 1_760_000_000);
  assert.equal(sent.action_source, "website");
  assert.equal(sent.event_source_url, "https://auralithforge.app/app");
  assert.deepEqual(sent.custom_data, { status: "completed" });
  assert.equal(calls[0].body.test_event_code, undefined);
});

test("test_event_code is included when META_TEST_EVENT_CODE is set", async () => {
  setEnv({ META_PIXEL_ID: "999", META_CAPI_TOKEN: "tok", META_TEST_EVENT_CODE: "TEST123" });
  const calls = captureFetch();
  await capi.sendMetaEvent(event);
  assert.equal(calls[0].body.test_event_code, "TEST123");
});

test("no-op (no network) when the env vars are unset", async () => {
  for (const env of [{}, { META_PIXEL_ID: "999" }, { META_CAPI_TOKEN: "tok" }]) {
    setEnv(env);
    const calls = captureFetch();
    assert.equal(await capi.sendMetaEvent(event), false);
    assert.equal(calls.length, 0);
  }
});

test("network errors, timeouts and non-2xx are swallowed", async () => {
  setEnv({ META_PIXEL_ID: "999", META_CAPI_TOKEN: "tok" });
  const originalError = console.error;
  console.error = () => {};
  try {
    capi._setFetchForTests(async () => {
      throw new Error("ECONNRESET");
    });
    assert.equal(await capi.sendMetaEvent(event), false);
    capi._setFetchForTests(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    assert.equal(await capi.sendMetaEvent(event), false);
    captureFetch({ ok: false, status: 400, text: async () => '{"error":"bad"}' });
    assert.equal(await capi.sendMetaEvent(event), false);
  } finally {
    console.error = originalError;
  }
});
