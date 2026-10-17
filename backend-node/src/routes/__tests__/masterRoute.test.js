// AURALITH-QA-003: route-level tests for POST /master, driving the REAL
// Express router (routes/masteringRoutes.js) with the real multer, ledger,
// masteringService and pythonUpstream against
//   * a local http server standing in for the Python DSP service, and
//   * the in-memory fake Firestore (services/__tests__/fakeFirestore.js).
//
// SEAMS (test-only, no product code changed):
//   1. Firestore: config/firebase.js is replaced through a module-resolution
//      hook (node:module register(), no CLI flag needed) with a stub whose
//      getFirestore() returns globalThis.__fakeDb. Firebase credentials are
//      never read.
//   2. Auth: server.js's requireAuth is not imported (importing server.js
//      starts a listener); a tiny middleware sets req.user from the
//      x-test-uid header, exactly the shape requireAuth attaches.
//   3. server.js's final JSON error handler (maps MulterError -> 413
//      file_too_large and filter errors -> 415) is NOT exported, so it is
//      reproduced below. If it drifts from server.js these tests will not
//      notice -- keep in sync.
//   4. Env/settings are set before a dynamic import: SQLite paths to a temp
//      dir, a 1 MB upload cap, a 600 ms gateway deadline.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

import express from "express";

import { createFakeFirestore } from "../../services/__tests__/fakeFirestore.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "master-route-"));
process.env.JOBS_DB_PATH = path.join(tmp, "jobs.db");
process.env.ANALYTICS_DB_PATH = path.join(tmp, "analytics.db");
process.env.UPLOAD_DIR = path.join(tmp, "uploads");
process.env.OUTPUT_DIR = path.join(tmp, "outputs");
process.env.MAX_UPLOAD_MB = "1"; // 1 MB; the oversize test sends 1.5 MB
process.env.PYTHON_UPSTREAM_TIMEOUT_MS = "600";
process.env.NODE_ENV = "test";

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

let python; // stub Python service
let pythonCalls = [];
let pythonBehaviour = null; // (req, res) => void
let app;
let base;
let settings;

before(async () => {
  python = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      pythonCalls.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString("latin1") });
      if (req.url === "/master") return pythonBehaviour(req, res);
      res.writeHead(200, { "content-type": "application/json" }); // cancel / file deletes
      res.end("{}");
    });
  });
  await new Promise((r) => python.listen(0, "127.0.0.1", r));

  ({ settings } = await import("../../config/settings.js"));
  settings.pythonApiBaseUrl = `http://127.0.0.1:${python.address().port}`;
  const { default: router } = await import("../masteringRoutes.js");

  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    const uid = req.get("x-test-uid");
    req.user = { uid, email: `${uid}@example.test`, signInProvider: "google", emailVerified: true, isAnonymous: false };
    next();
  });
  server.use("/", router);
  // Copy of server.js's final error handler (see SEAMS 3).
  server.use((err, req, res, _next) => {
    if (res.headersSent) return;
    if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ detail: `That file is larger than ${settings.maxUploadMb} MB.`, code: "file_too_large" });
    }
    const status = err.status || err.statusCode || (err.name === "MulterError" ? 400 : 500);
    const detail = status < 500 ? err.message || "Request rejected." : "Something went wrong on our side. Please try again.";
    res.status(status).json(err.code && status < 500 ? { detail, code: err.code } : { detail });
  });
  app = http.createServer(server);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app?.closeAllConnections();
  app?.close();
  python?.closeAllConnections();
  python?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let n = 0;
function newUser() {
  const uid = `qa-user-${++n}`;
  db.store.set(`users/${uid}`, {}); // free plan, 3 trial masters, nothing used
  pythonCalls = [];
  return uid;
}

async function postMaster(uid, { name = "mix.wav", type = "audio/wav", bytes = 64 } = {}) {
  const form = new FormData();
  form.append("genre", "pop");
  form.append("file", new Blob([Buffer.alloc(bytes, 1)], { type }), name);
  const res = await fetch(`${base}/master`, { method: "POST", body: form, headers: { "x-test-uid": uid } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave null */
  }
  return { status: res.status, body, text };
}

const used = (uid) => db.store.get(`users/${uid}`).freeMasterUsage?.used ?? 0; // free plan counter
const reservations = (uid) => [...db.store].filter(([k, v]) => k.startsWith("renderReservations/") && v.uid === uid).map(([, v]) => v);
const masterCalls = () => pythonCalls.filter((c) => c.url === "/master");

function assertRefunded(uid) {
  assert.equal(used(uid), 0, "master quota must not stay consumed");
  const r = reservations(uid);
  assert.equal(r.length, 1, "exactly one reservation was taken");
  assert.equal(r[0].state, "refunded");
}

function assertNoInternals(res) {
  for (const bad of [/Traceback/i, /\.py\b/, /File "/, /127\.0\.0\.1/, /localhost/, /ECONNREFUSED/, /uvicorn/i, /at \S+ \(/]) {
    assert.doesNotMatch(res.text, bad, `response leaks internals: ${bad}`);
  }
}

const json = (status, body, headers = {}) => (_req, res) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

test("Python 503 at_capacity -> 503 with code passthrough, reservation refunded", async () => {
  const uid = newUser();
  pythonBehaviour = json(503, { detail: "Server is at capacity" }, { "x-error-code": "at_capacity" });
  const res = await postMaster(uid);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, "at_capacity");
  assertNoInternals(res);
  assert.equal(masterCalls().length, 1);
  assertRefunded(uid);
});

test("Python 504 -> 504 processing_timeout, reservation refunded", async () => {
  const uid = newUser();
  pythonBehaviour = json(504, { detail: "deadline exceeded" }, { "x-error-code": "processing_timeout" });
  const res = await postMaster(uid);
  assert.equal(res.status, 504);
  assert.equal(res.body.code, "processing_timeout");
  assertNoInternals(res);
  assertRefunded(uid);
});

test("gateway deadline hit while Python is still rendering -> 504 processing_timeout, refunded, Python job cancelled", async () => {
  const uid = newUser();
  pythonBehaviour = () => {}; // never answers
  const res = await postMaster(uid);
  assert.equal(res.status, 504);
  assert.equal(res.body.code, "processing_timeout");
  assertNoInternals(res);
  assertRefunded(uid);
  assert.ok(
    pythonCalls.some((c) => /^\/jobs\/[^/]+\/cancel$/.test(c.url)),
    "Python must be told to stop the job",
  );
});

test("Python 500 with traceback text -> 502 and a generic detail, refunded", async () => {
  const uid = newUser();
  const leak = 'Traceback (most recent call last):\n  File "/srv/app/mastering.py", line 42, in render\nValueError: boom';
  pythonBehaviour = json(500, { detail: leak });
  const res = await postMaster(uid);
  assert.equal(res.status, 502);
  assert.equal(typeof res.body.detail, "string");
  assert.ok(res.body.detail.length > 0);
  assertNoInternals(res);
  assertRefunded(uid);
});

test("Python unreachable (ECONNREFUSED) -> 503 service_unavailable, no internal URL, refunded", async () => {
  const uid = newUser();
  const closedPort = await new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
  const saved = settings.pythonApiBaseUrl;
  settings.pythonApiBaseUrl = `http://127.0.0.1:${closedPort}`;
  try {
    const res = await postMaster(uid);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "service_unavailable");
    assert.ok(!res.text.includes(String(closedPort)), "port of the internal service must not leak");
    assertNoInternals(res);
    assertRefunded(uid);
  } finally {
    settings.pythonApiBaseUrl = saved;
  }
});

test("unsupported file type -> 415 unsupported_format, Python never called, nothing reserved", async () => {
  const uid = newUser();
  pythonBehaviour = json(200, {});
  const res = await postMaster(uid, { name: "malware.exe", type: "application/octet-stream" });
  assert.equal(res.status, 415);
  assert.equal(res.body.code, "unsupported_format");
  assert.equal(pythonCalls.length, 0);
  assert.equal(reservations(uid).length, 0);
  assert.equal(used(uid), 0);
});

test("oversize upload -> 413 file_too_large, Python never called, nothing reserved", async () => {
  const uid = newUser();
  pythonBehaviour = json(200, {});
  const res = await postMaster(uid, { bytes: 1536 * 1024});
  assert.equal(res.status, 413);
  assert.equal(res.body.code, "file_too_large");
  assert.equal(pythonCalls.length, 0);
  assert.equal(reservations(uid).length, 0);
  assert.equal(used(uid), 0);
});

test("Python 400 invalid_audio -> 400 invalid_audio, refunded", async () => {
  const uid = newUser();
  pythonBehaviour = json(400, { detail: "Could not decode audio" }, { "x-error-code": "invalid_audio" });
  const res = await postMaster(uid);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "invalid_audio");
  assertRefunded(uid);
});

test("success -> 200 and exactly one charge", async () => {
  const uid = newUser();
  pythonBehaviour = json(200, {
    job_id: "ignored-by-gateway",
    download_url: "/download/x",
    before_lufs: -18,
    after_lufs: -14,
    processing_applied: { engine: "adaptive_python_dsp" },
  });
  const res = await postMaster(uid);
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.job_id);
  assert.equal(masterCalls().length, 1);
  assert.equal(used(uid), 1);
  const r = reservations(uid);
  assert.equal(r.length, 1);
  assert.equal(r[0].state, "completed");
});

test("gateway tells Python a full render is not a preview (preview=false), and a preview is preview=true", async () => {
  const uid = newUser();
  pythonBehaviour = json(503, { detail: "busy" }, { "x-error-code": "at_capacity" });
  await postMaster(uid);
  assert.match(masterCalls()[0].body, /name="preview"\r\n\r\nfalse\r\n/);

  const { processMastering } = await import("../../services/masteringService.js");
  pythonCalls = [];
  const file = { path: path.join(tmp, "p.wav"), originalname: "p.wav", mimetype: "audio/wav", size: 4 };
  fs.writeFileSync(file.path, Buffer.alloc(4, 1));
  await processMastering({ file, fields: { genre: "pop" }, uid, jobId: "pvjob1", preview: true }).catch(() => {});
  assert.match(masterCalls()[0].body, /name="preview"\r\n\r\ntrue\r\n/);
});
