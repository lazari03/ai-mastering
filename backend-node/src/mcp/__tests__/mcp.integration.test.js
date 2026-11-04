// End-to-end tests for the ChatGPT / MCP integration (src/mcp/).
//
// Real pieces: the MCP SDK (server + client over real HTTP), the SDK's OAuth
// router with our provider, the reservation ledger (billing), entitlements,
// processMastering() and pythonUpstream (the real Node→Python client), the
// SQLite job history (jobsService) and the MCP store.
// Seams (test-only):
//   * Firestore → the in-memory fake (services/__tests__/fakeFirestore.js),
//     swapped in via a module-resolution hook exactly like masterRoute.test.js.
//   * The Python DSP service → a local HTTP stub (no DSP is run or changed).
//   * Firebase sign-in on the consent API → an x-test-uid header (the real
//     requireAuth is covered elsewhere; the consent router only reads req.user).
//   * Firebase account liveness on refresh → an injectable checkUser().
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { register } from "node:module";

import express from "express";

import { createFakeFirestore } from "../../services/__tests__/fakeFirestore.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-it-"));
process.env.JOBS_DB_PATH = path.join(tmp, "jobs.db");
process.env.ANALYTICS_DB_PATH = path.join(tmp, "analytics.db");
process.env.UPLOAD_DIR = path.join(tmp, "uploads");
process.env.OUTPUT_DIR = path.join(tmp, "outputs");
process.env.NODE_ENV = "test";
process.env.POLAR_PLAN_STUDIO_PRODUCT_ID = "prod_studio_test";
process.env.POLAR_PLAN_PRO_PRODUCT_ID = "prod_pro_test";

const hooks = `
export async function resolve(specifier, context, next) {
  if (/config\\/firebase\\.js$/.test(specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(
      "export const getFirestore = () => globalThis.__fakeDb;" +
      "export const getAuth = () => { throw new Error('auth not available in tests'); };" +
      "export const getFirebaseApp = () => { throw new Error('firebase app not available in tests'); };"), shortCircuit: true };
  }
  return next(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(hooks));

const db = createFakeFirestore();
globalThis.__fakeDb = db;

const CHATGPT_REDIRECT = "https://chatgpt.com/connector/oauth/test_callback_123";

let python; // stub DSP service
let pythonCalls = [];
let pythonBehaviour = null;
let server;
let base;
let integration;
let Client;
let StreamableHTTPClientTransport;
let jobsDb;
let userCheck = async () => ({ ok: true });

// ---- helpers --------------------------------------------------------------

function wav(seconds = 2, { claimSeconds = null } = {}) {
  const sr = 44100;
  const ch = 2;
  const bps = 2;
  const dataBytes = Math.round(seconds * sr) * ch * bps;
  const claimed = claimSeconds == null ? dataBytes : Math.round(claimSeconds * sr) * ch * bps;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * bps, 28);
  buf.writeUInt16LE(ch * bps, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(claimed, 40);
  return buf;
}

function okMaster(jobId) {
  return {
    job_id: jobId,
    download_url: `/download/${jobId}.wav`,
    before_lufs: -20.1,
    after_lufs: -9.0,
    analysis_before: { integrated_lufs: -20.1, true_peak_db: -3.2, loudness_range_lu: 8.1, crest_factor_db: 14.2, plr_db: 16.9, stereo_width_estimate: 0.31, stereo_correlation: 0.82 },
    analysis_after: { integrated_lufs: -9.1, true_peak_db: -1.1, loudness_range_lu: 6.2, crest_factor_db: 9.8, plr_db: 8.0, stereo_width_estimate: 0.34, stereo_correlation: 0.8 },
    ab_gain_match: null,
    ab_analysis: { improved: true, verdict_reasons: ["Tonal balance moved closer to target"] },
    quality_control: { passed: true, fail_count: 0, warn_count: 1, issues: ["Minor low-end build-up"] },
    processing_applied: { delivery_check: { format: "wav", passed: true, integrated_lufs: -9.02, true_peak_dbtp: -1.05, clipped_samples: 0, sample_peak_dbfs: -1.3 } },
    target_profile_used: { target_lufs: -9, true_peak_ceiling_dbtp: -1, genre: "pop", style: "modern", delivery: "auto" },
    source_warnings: [],
  };
}

const json = (status, body, headers = {}) => (_req, res) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

let n = 0;
function newUser(data = {}) {
  const uid = `mcp-user-${++n}`;
  db.store.set(`users/${uid}`, data);
  return uid;
}
const userDoc = (uid) => db.store.get(`users/${uid}`);
const reservationsOf = (uid) => [...db.store].filter(([k, v]) => k.startsWith("renderReservations/") && v.uid === uid).map(([, v]) => v);
const masterCalls = () => pythonCalls.filter((c) => c.method === "POST" && c.url === "/master");

function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(body = {}) {
  const res = await fetch(`${base}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: [CHATGPT_REDIRECT], client_name: "ChatGPT", token_endpoint_auth_method: "client_secret_post", ...body }),
  });
  return { status: res.status, body: await res.json() };
}

async function authorize(client, { uid, challenge, scope, resource = `${base}/mcp`, approve = true, state = "st-1" }) {
  const url = new URL(`${base}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", CHATGPT_REDIRECT);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (scope) url.searchParams.set("scope", scope);
  if (resource) url.searchParams.set("resource", resource);
  const res = await fetch(url, { redirect: "manual" });
  const location = new URL(res.headers.get("location"));
  if (location.origin === "https://chatgpt.com") return { error: Object.fromEntries(location.searchParams) };
  const requestId = location.searchParams.get("request");
  const info = await fetch(`${base}/oauth/requests/${requestId}`, { headers: { "x-test-uid": uid } }).then((r) => r.json());
  const decision = await fetch(`${base}/oauth/requests/${requestId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-uid": uid },
    body: JSON.stringify({ approve }),
  }).then((r) => r.json());
  const back = new URL(decision.redirect_url);
  return { info, consentUrl: location, redirect: back, params: Object.fromEntries(back.searchParams) };
}

async function token(client, params) {
  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.client_id, ...(client.client_secret ? { client_secret: client.client_secret } : {}), ...params }),
  });
  return { status: res.status, body: await res.json() };
}

// Full ChatGPT-style connection for one Auralith user.
async function connect(uid, { scope } = {}) {
  const { body: client } = await registerClient();
  const { verifier, challenge } = pkce();
  const auth = await authorize(client, { uid, challenge, scope });
  const tok = await token(client, { grant_type: "authorization_code", code: auth.params.code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT, resource: `${base}/mcp` });
  assert.equal(tok.status, 200, JSON.stringify(tok.body));
  return { client, tokens: tok.body };
}

async function mcpClient(accessToken) {
  const client = new Client({ name: "test-chatgpt", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } });
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return { isError: Boolean(res.isError), data: res.structuredContent, raw: res };
}

async function upload(createOut, bytes, name = "song.wav") {
  const url = new URL(createOut.upload_url);
  url.searchParams.set("name", name);
  const res = await fetch(url, { method: "PUT", body: bytes, headers: { "content-type": "application/octet-stream" } });
  return { status: res.status, body: await res.json() };
}

async function masterOnce(mcp, { genre = "pop", ...rest } = {}) {
  const created = await call(mcp, "create_upload", { filename: "song.wav" });
  assert.equal(created.isError, false, JSON.stringify(created.data));
  const up = await upload(created.data, wav(2));
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const started = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre, ...rest });
  return { created, started };
}

// ---- setup ------------------------------------------------------------------

before(async () => {
  python = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("latin1");
      const jobId = /name="job_id"\r\n\r\n([A-Za-z0-9_-]+)/.exec(body)?.[1] || null;
      pythonCalls.push({ method: req.method, url: req.url, jobId });
      if (req.method === "POST" && req.url === "/master") return pythonBehaviour(req, res, jobId);
      const dl = /^\/download\/([A-Za-z0-9]+)\.wav$/.exec(req.url);
      if (req.method === "GET" && dl) {
        const payload = Buffer.from(`RIFF-mastered-${dl[1]}`);
        res.writeHead(200, { "content-type": "audio/wav", "content-length": payload.length });
        return res.end(payload);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((r) => python.listen(0, "127.0.0.1", r));

  // Listen first: the OAuth issuer / resource URLs need the real port.
  let handler = (_req, res) => res.end();
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const { settings } = await import("../../config/settings.js");
  settings.pythonApiBaseUrl = `http://127.0.0.1:${python.address().port}`;
  const { loadMcpConfig } = await import("../config.js");
  const { createMcpStore } = await import("../store.js");
  const { createMcpIntegration } = await import("../index.js");
  const { createLedger } = await import("../../services/reservationLedger.js");
  const ent = await import("../../services/entitlementsService.js");
  const polar = await import("../../services/polarService.js");
  const masteringService = await import("../../services/masteringService.js");
  const jobsService = await import("../../services/jobsService.js");
  const presets = await import("../../services/presetsService.js");
  jobsDb = (await import("../../config/jobsDb.js")).default;
  ({ Client } = await import("@modelcontextprotocol/sdk/client/index.js"));
  ({ StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js"));

  const config = loadMcpConfig({
    MCP_ENABLED: "true",
    MCP_PUBLIC_ORIGIN: base,
    MCP_OAUTH_ISSUER: base,
    MCP_CONSENT_URL: `${base}/connect/authorize`,
    MCP_MAX_UPLOAD_MB: "1",
    MCP_MAX_CONCURRENT_JOBS: "2",
    MCP_MAX_ACTIVE_JOBS_PER_USER: "2",
    // Every test uploads from 127.0.0.1; the per-IP limits are not under test here.
    MCP_RATE_UPLOAD_PUTS_PER_IP_15M: "1000",
    MCP_RATE_DOWNLOADS_PER_IP_5M: "1000",
  });
  const store = createMcpStore({ dbPath: path.join(tmp, "mcp.db") });
  integration = createMcpIntegration({
    config,
    store,
    log: { error: () => {}, warn: () => {} },
    deps: {
      secret: "test-secret-0123456789",
      uploadDir: process.env.UPLOAD_DIR,
      pythonApiBaseUrl: settings.pythonApiBaseUrl,
      upstreamTimeoutMs: 5000,
      ledger: createLedger({ db }),
      readUserData: ent.readUserData,
      planFromUserData: polar.planFromUserData,
      subscriptionStatusFromUserData: polar.subscriptionStatusFromUserData,
      entitlementsFromUserData: ent.entitlementsFromUserData,
      processMastering: masteringService.processMastering,
      recordJob: jobsService.recordJob,
      deleteJob: jobsService.deleteJob,
      deleteJobFiles: masteringService.deleteJobFiles,
      cancelPythonJob: masteringService.cancelPythonJob,
      ownsJob: jobsService.ownsJob,
      jobsService: { getJob: jobsService.getJob },
      getMixPresetByName: presets.getMixPresetByName,
      recordServerEvent: () => {},
      checkUser: (...args) => userCheck(...args),
    },
  });

  const app = express();
  app.use(integration.publicRouter);
  app.use(express.json());
  app.use((req, res, next) => {
    const uid = req.get("x-test-uid");
    if (!uid) return res.status(401).json({ detail: "sign in" });
    req.user = { uid, email: `${uid}@example.test` };
    return next();
  });
  app.use(integration.consentRouter);
  handler = app;
});

after(() => {
  integration?.stop();
  server?.closeAllConnections();
  server?.close();
  python?.closeAllConnections();
  python?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- discovery & OAuth ------------------------------------------------------

test("discovery: protected-resource + authorization-server metadata; unauthenticated /mcp gets a 401 challenge", async () => {
  const prm = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`).then((r) => r.json());
  assert.equal(prm.resource, `${base}/mcp`);
  assert.deepEqual(prm.authorization_servers, [`${base}/`]);
  assert.deepEqual(prm.scopes_supported, ["mastering:read", "mastering:write"]);
  const root = await fetch(`${base}/.well-known/oauth-protected-resource`).then((r) => r.json());
  assert.equal(root.resource, prm.resource);

  const as = await fetch(`${base}/.well-known/oauth-authorization-server`).then((r) => r.json());
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.ok(as.registration_endpoint && as.token_endpoint && as.authorization_endpoint);
  assert.ok(as.grant_types_supported.includes("refresh_token"));

  const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test("DCR refuses redirect URIs outside the allowlist", async () => {
  const bad = await registerClient({ redirect_uris: ["https://evil.example/callback"] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "invalid_client_metadata");
  const good = await registerClient();
  assert.equal(good.status, 201);
  assert.match(good.body.client_id, /^afc_/);
  assert.ok(good.body.client_secret, "confidential client gets its secret once");
  assert.equal(good.body.client_secret_expires_at, 0);
});

test("authorization: consent page sees the client; approval returns code + state + iss; wrong resource is refused", async () => {
  const uid = newUser();
  const { body: client } = await registerClient();
  const { challenge } = pkce();
  const auth = await authorize(client, { uid, challenge });
  assert.equal(auth.consentUrl.pathname, "/connect/authorize");
  assert.equal(auth.info.client_name, "ChatGPT");
  assert.equal(auth.info.redirect_host, "chatgpt.com");
  assert.equal(auth.info.account.email, `${uid}@example.test`);
  assert.equal(auth.redirect.origin + auth.redirect.pathname, CHATGPT_REDIRECT);
  assert.ok(auth.params.code);
  assert.equal(auth.params.state, "st-1");
  const asMeta = await fetch(`${base}/.well-known/oauth-authorization-server`).then((r) => r.json());
  assert.equal(auth.params.iss, asMeta.issuer, "iss matches the published issuer exactly");

  const wrong = await authorize(client, { uid, challenge, resource: "https://other.example/mcp" });
  assert.equal(wrong.error.error, "invalid_target");
});

test("token endpoint: PKCE is enforced, codes are single-use (replay revokes), client secret is checked", async () => {
  const uid = newUser();
  const { body: client } = await registerClient();
  const { verifier, challenge } = pkce();
  const auth = await authorize(client, { uid, challenge });

  const badSecret = await token({ ...client, client_secret: "nope" }, { grant_type: "authorization_code", code: auth.params.code, code_verifier: verifier });
  assert.equal(badSecret.status, 401);
  assert.equal(badSecret.body.error, "invalid_client");

  const badVerifier = await token(client, { grant_type: "authorization_code", code: auth.params.code, code_verifier: pkce().verifier });
  assert.equal(badVerifier.status, 400);
  assert.equal(badVerifier.body.error, "invalid_grant");

  const good = await token(client, { grant_type: "authorization_code", code: auth.params.code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT });
  assert.equal(good.status, 200);
  assert.match(good.body.access_token, /^afm_at_/);
  assert.match(good.body.refresh_token, /^afm_rt_/);
  assert.equal(good.body.token_type, "Bearer");

  const replay = await token(client, { grant_type: "authorization_code", code: auth.params.code, code_verifier: verifier });
  assert.equal(replay.body.error, "invalid_grant");
  const after = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${good.body.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(after.status, 401, "tokens minted from a replayed code are revoked");
});

test("refresh tokens rotate; reusing an old one revokes the whole connection", async () => {
  const uid = newUser();
  const { client, tokens } = await connect(uid);
  const r1 = await token(client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  assert.equal(r1.status, 200);
  assert.notEqual(r1.body.refresh_token, tokens.refresh_token);
  const reuse = await token(client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  assert.equal(reuse.body.error, "invalid_grant");
  const r2 = await token(client, { grant_type: "refresh_token", refresh_token: r1.body.refresh_token });
  assert.equal(r2.body.error, "invalid_grant", "the rotated token died with the revoked grant");
});

test("refresh re-checks the Firebase account (disabled / signed out everywhere → revoked)", async () => {
  const uid = newUser();
  const { client, tokens } = await connect(uid);
  userCheck = async () => ({ ok: false, reason: "account_disabled" });
  try {
    const r = await token(client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    assert.equal(r.body.error, "invalid_grant");
  } finally {
    userCheck = async () => ({ ok: true });
  }
  const mcpRes = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(mcpRes.status, 401);
});

test("a token bound to another resource is rejected by /mcp (audience check)", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid);
  integration.store.db.prepare("UPDATE oauth_grants SET resource = ? WHERE uid = ?").run("https://elsewhere.example/mcp", uid);
  const res = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(res.status, 401);
});

test("read-only grant: write tools answer insufficient_scope with an mcp/www_authenticate hint", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid, { scope: "mastering:read" });
  const mcp = await mcpClient(tokens.access_token);
  const acct = await call(mcp, "get_account");
  assert.equal(acct.isError, false);
  const res = await call(mcp, "create_upload", {});
  assert.equal(res.isError, true);
  assert.equal(res.data.error.code, "insufficient_scope");
  assert.match(res.raw._meta["mcp/www_authenticate"][0], /insufficient_scope/);
  await mcp.close();
});

test("tools/list: five tools with strict schemas, annotations and OAuth security schemes", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const { tools } = await mcp.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["create_upload", "get_account", "get_job_status", "get_master_result", "start_mastering"]);
  for (const t of tools) {
    assert.equal(typeof t.annotations.readOnlyHint, "boolean");
    assert.equal(t.annotations.destructiveHint, false);
    assert.equal(t.annotations.openWorldHint, false);
    assert.equal(t._meta.securitySchemes[0].type, "oauth2");
    assert.equal(t.inputSchema.additionalProperties, false, `${t.name} input must be strict`);
    assert.ok(t.outputSchema, `${t.name} declares an output schema`);
  }
  const bogus = await call(mcp, "start_mastering", { upload_id: "../../etc/passwd", genre: "pop" });
  assert.equal(bogus.isError, true);
  const extra = await call(mcp, "get_job_status", { job_id: "a".repeat(32), path: "/etc/passwd" });
  assert.equal(extra.isError, true, "unknown properties are rejected");
  await mcp.close();
});

// ---- mastering flows ----------------------------------------------------------

test("free user: account → upload → master (async) → poll → result → download; quota spent once", async () => {
  const uid = newUser();
  pythonCalls = [];
  pythonBehaviour = (_req, res, jobId) => json(200, okMaster(jobId))(_req, res);
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);

  const acct = await call(mcp, "get_account");
  assert.equal(acct.data.account.plan, "free");
  assert.equal(acct.data.masters.remaining, 3);
  assert.equal(acct.data.masters.resets_monthly, false);
  assert.equal(acct.data.professional_tier_available, false);
  assert.ok(acct.data.options.genres.includes("pop"));

  const { started } = await masterOnce(mcp);
  assert.equal(started.isError, false, JSON.stringify(started.data));
  assert.equal(started.data.deduplicated, false);
  assert.ok(["queued", "processing", "completed"].includes(started.data.status));
  const jobId = started.data.job_id;
  assert.match(jobId, /^[a-f0-9]{32}$/);

  await integration.jobRunner.drain();
  const status = await call(mcp, "get_job_status", { job_id: jobId });
  assert.equal(status.data.status, "completed");
  assert.equal(status.data.error, null);

  const result = await call(mcp, "get_master_result", { job_id: jobId });
  assert.equal(result.isError, false, JSON.stringify(result.data));
  assert.equal(result.data.measurements.integrated_lufs, -9.02, "delivered-file loudness wins");
  assert.equal(result.data.measurements.true_peak_dbtp, -1.05);
  assert.equal(result.data.measurements.before.integrated_lufs, -20.1);
  assert.equal(result.data.measurements.quality_control.passed, true);
  assert.equal(result.data.measurements.target.integrated_lufs, -9);
  assert.equal(result.data.download.format, "wav");

  const dl = await fetch(result.data.download.url);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "audio/wav");
  assert.match(dl.headers.get("content-disposition"), /attachment; filename="song \(Auralith master\)\.wav"/);
  assert.equal(await dl.text(), `RIFF-mastered-${jobId}`);

  assert.equal(userDoc(uid).freeMasterUsage.used, 1);
  const [reservation] = reservationsOf(uid);
  assert.equal(reservation.state, "completed");
  assert.equal(masterCalls().length, 1);
  const masterCall = masterCalls()[0];
  assert.equal(masterCall.jobId, jobId, "Python got the gateway job id (cancellable)");
  const history = jobsDb.prepare("SELECT preview, original_filename FROM jobs WHERE uid = ? AND job_id = ?").get(uid, jobId);
  assert.deepEqual({ ...history }, { preview: 0, original_filename: "song.wav" }, "the master shows up in the website's My Masters");

  const after = await call(mcp, "get_account");
  assert.equal(after.data.masters.remaining, 2);
  await mcp.close();
});

test("duplicate submissions (sequential and concurrent) create one job and one charge", async () => {
  const uid = newUser();
  pythonCalls = [];
  pythonBehaviour = (req, res, jobId) => setTimeout(() => json(200, okMaster(jobId))(req, res), 50);
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const created = await call(mcp, "create_upload", {});
  await upload(created.data, wav(2));
  const args = { upload_id: created.data.upload_id, genre: "rock", tags: ["warmer", "louder"] };
  const [a, b, c] = await Promise.all([call(mcp, "start_mastering", args), call(mcp, "start_mastering", args), call(mcp, "start_mastering", { ...args, tags: ["louder", "warmer"] })]);
  const ids = new Set([a, b, c].map((r) => r.data.job_id));
  assert.equal(ids.size, 1, "same request → same job (tag order irrelevant)");
  assert.equal([a, b, c].filter((r) => r.data.deduplicated).length, 2);
  await integration.jobRunner.drain();
  const again = await call(mcp, "start_mastering", args);
  assert.equal(again.data.deduplicated, true);
  assert.equal(again.data.status, "completed");

  // Explicit idempotency key across different settings.
  const k1 = await call(mcp, "start_mastering", { ...args, genre: "pop", idempotency_key: "chatgpt-call-0001" });
  const k2 = await call(mcp, "start_mastering", { ...args, genre: "jazz", idempotency_key: "chatgpt-call-0001" });
  assert.equal(k1.data.job_id, k2.data.job_id);
  await integration.jobRunner.drain();

  assert.equal(masterCalls().length, 2);
  assert.equal(userDoc(uid).freeMasterUsage.used, 2);
  await mcp.close();
});

test("active paid subscriber: Professional tier allowed, monthly quota charged", async () => {
  const uid = newUser({ subscription: { status: "active", productId: "prod_studio_test", currentPeriodEnd: new Date(Date.now() + 20 * 86400000) } });
  pythonBehaviour = (_req, res, jobId) => json(200, okMaster(jobId))(_req, res);
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const acct = await call(mcp, "get_account");
  assert.equal(acct.data.account.plan, "studio");
  assert.equal(acct.data.subscription.active, true);
  assert.equal(acct.data.masters.limit, 50);
  assert.equal(acct.data.masters.resets_monthly, true);
  assert.deepEqual(acct.data.options.tiers, ["standard", "professional"]);
  const { started } = await masterOnce(mcp, { tier: "professional", delivery: "streaming" });
  assert.equal(started.isError, false, JSON.stringify(started.data));
  await integration.jobRunner.drain();
  assert.equal(userDoc(uid).masterQuota.used, 1);
  assert.equal(userDoc(uid).freeMasterUsage, undefined);
  const r = reservationsOf(uid)[0];
  assert.equal(r.plan, "studio");
  assert.equal(r.parts.master.counter, "masterQuota");
  await mcp.close();
});

test("expired subscription falls back to Free: Professional refused (plan_required), nothing charged", async () => {
  const uid = newUser({ subscription: { status: "canceled", productId: "prod_studio_test", currentPeriodEnd: new Date(Date.now() - 86400000), endedAt: new Date(Date.now() - 86400000) } });
  pythonCalls = [];
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const acct = await call(mcp, "get_account");
  assert.equal(acct.data.account.plan, "free");
  assert.equal(acct.data.subscription.active, false);
  const { started } = await masterOnce(mcp, { tier: "professional" });
  assert.equal(started.isError, true);
  assert.equal(started.data.error.code, "plan_required");
  assert.equal(masterCalls().length, 0);
  assert.equal(reservationsOf(uid).length, 0);
  assert.equal(userDoc(uid).freeMasterUsage, undefined);
  await mcp.close();
});

test("exhausted quota: refused with quota_exhausted (no render, no job); a purchased credit unlocks one master", async () => {
  const uid = newUser({ freeMasterUsage: { used: 3 } });
  pythonCalls = [];
  pythonBehaviour = (_req, res, jobId) => json(200, okMaster(jobId))(_req, res);
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const acct = await call(mcp, "get_account");
  assert.equal(acct.data.masters.can_master_now, false);
  const { created, started } = await masterOnce(mcp);
  assert.equal(started.isError, true);
  assert.equal(started.data.error.code, "quota_exhausted");
  assert.equal(started.data.error.retryable, false);
  assert.equal(masterCalls().length, 0);
  assert.equal(integration.store.db.prepare("SELECT COUNT(*) AS n FROM mcp_jobs WHERE uid = ?").get(uid).n, 0);

  db.store.set(`users/${uid}`, { ...userDoc(uid), extraMasterCredits: 1 });
  const retry = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  assert.equal(retry.isError, false, JSON.stringify(retry.data));
  await integration.jobRunner.drain();
  assert.equal(userDoc(uid).extraMasterCredits, 0);
  assert.equal(userDoc(uid).freeMasterUsage.used, 3);
  await mcp.close();
});

test("isolation: another account can't use, see or download someone else's upload, job or file", async () => {
  const alice = newUser();
  const bob = newUser();
  pythonBehaviour = (_req, res, jobId) => json(200, okMaster(jobId))(_req, res);
  const a = await mcpClient((await connect(alice)).tokens.access_token);
  const b = await mcpClient((await connect(bob)).tokens.access_token);

  const { created, started } = await masterOnce(a);
  await integration.jobRunner.drain();
  const jobId = started.data.job_id;
  const aliceResult = await call(a, "get_master_result", { job_id: jobId });

  const useUpload = await call(b, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  assert.equal(useUpload.data.error.code, "upload_not_found");
  assert.equal((await call(b, "get_job_status", { job_id: jobId })).data.error.code, "job_not_found");
  assert.equal((await call(b, "get_master_result", { job_id: jobId })).data.error.code, "job_not_found");

  // Bob's own job's download token can't be pointed at Alice's job.
  const bobJob = await masterOnce(b);
  await integration.jobRunner.drain();
  const bobResult = await call(b, "get_master_result", { job_id: bobJob.started.data.job_id });
  const bobToken = new URL(bobResult.data.download.url).searchParams.get("token");
  assert.equal((await fetch(`${base}/mcp/download/${jobId}?token=${encodeURIComponent(bobToken)}`)).status, 404);
  // Tampered token, upload token reused as a download token, no token.
  const aliceUrl = new URL(aliceResult.data.download.url);
  const tampered = aliceUrl.searchParams.get("token").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  assert.equal((await fetch(`${base}/mcp/download/${jobId}?token=${encodeURIComponent(tampered)}`)).status, 404);
  const uploadToken = new URL(created.data.upload_url).searchParams.get("token");
  assert.equal((await fetch(`${base}/mcp/download/${jobId}?token=${encodeURIComponent(uploadToken)}`)).status, 404);
  assert.equal((await fetch(`${base}/mcp/download/${jobId}`)).status, 404);
  // Alice's real link works.
  assert.equal((await fetch(aliceUrl)).status, 200);

  // Upload tokens are bound to one upload.
  const bobUpload = await call(b, "create_upload", {});
  const wrongPut = new URL(bobUpload.data.upload_url);
  wrongPut.searchParams.set("token", uploadToken);
  assert.equal((await fetch(wrongPut, { method: "PUT", body: wav(1) })).status, 403);
  await a.close();
  await b.close();
});

test("upload validation: not-audio, extension mismatch, oversized and over-long files are refused; the link stays usable", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const created = await call(mcp, "create_upload", { filename: "song.wav" });

  const text = await upload(created.data, Buffer.from("this is not audio at all, just text"), "song.wav");
  assert.equal(text.status, 415);
  assert.equal(text.body.error.code, "unsupported_format");

  const flacAsWav = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(60)]);
  const mismatch = await upload(created.data, flacAsWav, "song.wav");
  assert.equal(mismatch.body.error.code, "format_mismatch");

  const exe = await upload(created.data, Buffer.from("MZ"), "song.exe");
  assert.equal(exe.status, 415);

  const big = await upload(created.data, Buffer.concat([wav(1), Buffer.alloc(1.5 * 1024 * 1024)]), "song.wav");
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, "file_too_large");

  const long = await upload(created.data, wav(1, { claimSeconds: 20 * 60 }), "song.wav");
  assert.equal(long.status, 413);
  assert.equal(long.body.error.code, "too_long");

  const notReady = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  assert.equal(notReady.data.error.code, "upload_not_ready");
  assert.match(notReady.data.error.message, /minutes long/);

  const good = await upload(created.data, wav(2), "final mix.wav");
  assert.equal(good.status, 201);
  assert.equal(good.body.format, "wav");
  assert.equal(good.body.duration_s, 2);
  const twice = await upload(created.data, wav(2), "final mix.wav");
  assert.equal(twice.status, 409, "single use");

  const badName = await call(mcp, "create_upload", { filename: "notes.txt" });
  assert.equal(badName.data.error.code, "invalid_input");
  const page = await fetch(created.data.upload_url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  await mcp.close();
});

test("invalid settings are rejected before anything is charged", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const created = await call(mcp, "create_upload", {});
  await upload(created.data, wav(2));
  const cases = [
    [{ genre: "polka" }, null],
    [{}, "invalid_input"],
    [{ genre: "pop", category: "warm", flavour: "crisp" }, "invalid_input"],
    [{ genre: "pop", flavour: "airy" }, "invalid_input"],
    [{ mix_preset: "Nope" }, "invalid_input"],
    [{ genre: "pop", tags: ["shinier"] }, null],
  ];
  for (const [args, code] of cases) {
    const r = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, ...args });
    assert.equal(r.isError, true, JSON.stringify(args));
    if (code) assert.equal(r.data.error.code, code, JSON.stringify(args));
  }
  const preset = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, mix_preset: "streaming_pop_glue" });
  assert.equal(preset.isError, false, JSON.stringify(preset.data));
  await integration.jobRunner.drain();
  assert.equal(userDoc(uid).freeMasterUsage.used, 1);
  await mcp.close();
});

test("processing failures: engine crash → failed/retryable + refunded; bad audio → failed/not retryable; retry creates a new job", async () => {
  const uid = newUser();
  pythonCalls = [];
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const created = await call(mcp, "create_upload", {});
  await upload(created.data, wav(2));

  pythonBehaviour = json(500, { detail: 'Traceback (most recent call last):\n  File "/srv/x.py"' });
  const first = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  await integration.jobRunner.drain();
  const s1 = await call(mcp, "get_job_status", { job_id: first.data.job_id });
  assert.equal(s1.data.status, "failed");
  assert.equal(s1.data.error.retryable, true);
  assert.doesNotMatch(JSON.stringify(s1.data), /Traceback|\.py/);
  assert.equal(userDoc(uid).freeMasterUsage.used, 0, "refunded");
  assert.equal(reservationsOf(uid)[0].state, "refunded");
  const res1 = await call(mcp, "get_master_result", { job_id: first.data.job_id });
  assert.equal(res1.data.error.code, "job_failed");

  pythonBehaviour = json(400, { detail: "The audio is digital silence." }, { "x-error-code": "invalid_audio" });
  const second = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  assert.notEqual(second.data.job_id, first.data.job_id, "a failed request can be retried");
  assert.equal(second.data.deduplicated, false);
  await integration.jobRunner.drain();
  const s2 = await call(mcp, "get_job_status", { job_id: second.data.job_id });
  assert.equal(s2.data.error.code, "invalid_audio");
  assert.equal(s2.data.error.retryable, false);
  assert.equal(s2.data.error.message, "The audio is digital silence.");

  pythonBehaviour = json(503, { detail: "Server is at capacity" }, { "x-error-code": "at_capacity" });
  const third = await call(mcp, "start_mastering", { upload_id: created.data.upload_id, genre: "pop" });
  await integration.jobRunner.drain();
  const s3 = await call(mcp, "get_job_status", { job_id: third.data.job_id });
  assert.equal(s3.data.error.code, "server_busy");
  assert.equal(s3.data.error.retryable, true);

  assert.equal(userDoc(uid).freeMasterUsage.used, 0);
  assert.equal(masterCalls().length, 3);
  await mcp.close();
});

test("result expiry: after the 48h file window get_master_result and the download link answer result_expired", async () => {
  const uid = newUser();
  pythonBehaviour = (_req, res, jobId) => json(200, okMaster(jobId))(_req, res);
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  const { started } = await masterOnce(mcp);
  await integration.jobRunner.drain();
  const res = await call(mcp, "get_master_result", { job_id: started.data.job_id });
  jobsDb.prepare("UPDATE jobs SET expires_at = ? WHERE uid = ? AND job_id = ?").run(new Date(Date.now() - 1000).toISOString(), uid, started.data.job_id);
  assert.equal((await call(mcp, "get_master_result", { job_id: started.data.job_id })).data.error.code, "result_expired");
  assert.equal((await fetch(res.data.download.url)).status, 410);
  await mcp.close();
});

test("concurrent users: independent jobs, each user sees only their own result; per-user active cap holds", async () => {
  pythonCalls = [];
  pythonBehaviour = (req, res, jobId) => setTimeout(() => json(200, okMaster(jobId))(req, res), 30);
  const users = [newUser(), newUser(), newUser(), newUser()];
  const clients = await Promise.all(users.map(async (uid) => mcpClient((await connect(uid)).tokens.access_token)));
  const runs = await Promise.all(clients.map((c) => masterOnce(c)));
  for (const r of runs) assert.equal(r.started.isError, false, JSON.stringify(r.started.data));
  await integration.jobRunner.drain();
  const results = await Promise.all(clients.map((c, i) => call(c, "get_master_result", { job_id: runs[i].started.data.job_id })));
  for (const r of results) assert.equal(r.isError, false);
  assert.equal(new Set(runs.map((r) => r.started.data.job_id)).size, 4);
  for (const uid of users) assert.equal(userDoc(uid).freeMasterUsage.used, 1);
  // Cross-check: user 0 can't read user 1's job.
  assert.equal((await call(clients[0], "get_job_status", { job_id: runs[1].started.data.job_id })).data.error.code, "job_not_found");

  // Per-user cap: a slow engine and three different requests from one user.
  pythonBehaviour = (req, res, jobId) => setTimeout(() => json(200, okMaster(jobId))(req, res), 300);
  const cap = clients[2];
  const up = await call(cap, "create_upload", {});
  await upload(up.data, wav(2));
  const reqs = await Promise.all(["pop", "rock", "jazz"].map((genre) => call(cap, "start_mastering", { upload_id: up.data.upload_id, genre })));
  assert.equal(reqs.filter((r) => r.isError && r.data.error.code === "too_many_active_jobs").length, 1);
  await integration.jobRunner.drain();
  await Promise.all(clients.map((c) => c.close()));
});

test("restart recovery: an orphaned active job is failed as interrupted (or completed if it was delivered)", async () => {
  const uid = newUser();
  const store = integration.store;
  store.insertUpload({ upload_id: "f".repeat(32), uid, filename: "x.wav", ext: ".wav", declared_bytes: null, created_at: Date.now(), url_expires_at: Date.now() + 60000, expires_at: Date.now() + 60000 });
  const orphan = "e".repeat(32);
  store.claimJob({ jobId: orphan, uid, uploadId: "f".repeat(32), idempotencyKey: "auto:orphan", settings: { tier: "standard" }, originalFilename: "x.wav" });
  const delivered = "d".repeat(32);
  store.claimJob({ jobId: delivered, uid, uploadId: "f".repeat(32), idempotencyKey: "auto:delivered", settings: { tier: "standard" }, originalFilename: "x.wav" });
  const { recordJob } = await import("../../services/jobsService.js");
  await recordJob(uid, { job_id: delivered, ...okMaster(delivered), output_format: "wav" });
  await integration.sweep({ minAgeMs: 0 });
  assert.equal(store.getJob(orphan).status, "failed");
  assert.equal(store.getJob(orphan).error_code, "interrupted");
  assert.equal(store.getJob(delivered).status, "completed");
  // Delivered-file loudness (delivery_check) wins over the engine's estimate.
  assert.equal(JSON.parse(store.getJob(delivered).result).after.integrated_lufs, -9.02);
  assert.equal(JSON.parse(store.getJob(delivered).result).before.integrated_lufs, -20.1);
});

test("account deletion revokes ChatGPT access and removes MCP data", async () => {
  const uid = newUser();
  const { tokens } = await connect(uid);
  const mcp = await mcpClient(tokens.access_token);
  await call(mcp, "create_upload", {});
  await mcp.close();
  integration.deleteUserData(uid);
  const res = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(res.status, 401);
  assert.equal(integration.store.db.prepare("SELECT COUNT(*) AS n FROM mcp_uploads WHERE uid = ?").get(uid).n, 0);
});

test("consent: denial redirects with access_denied; a request can't be approved twice", async () => {
  const uid = newUser();
  const { body: client } = await registerClient();
  const denied = await authorize(client, { uid, challenge: pkce().challenge, approve: false });
  assert.equal(denied.params.error, "access_denied");
  assert.equal(denied.params.state, "st-1");

  const url = new URL(`${base}/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: CHATGPT_REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256" })) url.searchParams.set(k, v);
  const loc = new URL((await fetch(url, { redirect: "manual" })).headers.get("location"));
  const id = loc.searchParams.get("request");
  const once = await fetch(`${base}/oauth/requests/${id}/decision`, { method: "POST", headers: { "content-type": "application/json", "x-test-uid": uid }, body: '{"approve":true}' });
  assert.equal(once.status, 200);
  const twice = await fetch(`${base}/oauth/requests/${id}/decision`, { method: "POST", headers: { "content-type": "application/json", "x-test-uid": uid }, body: '{"approve":true}' });
  assert.equal(twice.status, 410);
  const anon = await fetch(`${base}/oauth/requests/${id}`);
  assert.equal(anon.status, 401, "consent API requires a signed-in Auralith user");
});
