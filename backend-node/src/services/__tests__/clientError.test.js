import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

import { toClientError, UpstreamUnavailableError, GENERIC_SERVER_DETAIL } from "../clientError.js";

test("server-side failures never forward their message to the browser", () => {
  const python5xx = Object.assign(new Error('Mastering failed: "Traceback ... /app/outputs/abc.wav"'), { status: 500, code: "render_failed" });
  assert.deepEqual(toClientError(python5xx), { status: 502, body: { code: "render_failed", detail: GENERIC_SERVER_DETAIL } });

  const gatewayBug = new TypeError("Cannot read properties of undefined (reading 'path')");
  assert.deepEqual(toClientError(gatewayBug, { fallbackDetail: "x" }), { status: 500, body: { code: null, detail: "x" } });
});

test("user-facing upstream 4xx and retryable statuses keep their status, message and code", () => {
  const bad = Object.assign(new Error("We couldn't decode this audio file."), { status: 400, code: "invalid_audio" });
  assert.deepEqual(toClientError(bad), { status: 400, body: { code: "invalid_audio", detail: "We couldn't decode this audio file." } });

  const validation = Object.assign(new Error("bad field"), { status: 422 });
  assert.equal(toClientError(validation).status, 400);

  for (const status of [409, 413, 415, 499, 503, 504]) {
    const err = Object.assign(new Error("m"), { status, code: "c" });
    assert.equal(toClientError(err).status, status);
    assert.equal(toClientError(err).body.detail, "m");
  }
});

test("an unreachable Python service is a coded 503 that reveals no internal URL", async () => {
  // Grab a free port, then close it so the connection is refused.
  const port = await new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  process.env.PYTHON_API_BASE_URL = `http://127.0.0.1:${port}`;
  const { postMultipartToPython } = await import("../masteringService.js");
  const tmp = path.join(os.tmpdir(), `clienterr-${process.pid}.wav`);
  fs.writeFileSync(tmp, "RIFF");
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(postMultipartToPython("/master", { files: { file: { path: tmp } } }), (err) => {
      assert.ok(err instanceof UpstreamUnavailableError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "service_unavailable");
      assert.ok(!err.message.includes("127.0.0.1"), "internal host leaked");
      assert.ok(!err.message.includes("uvicorn"), "dev instructions leaked");
      const mapped = toClientError(err);
      assert.equal(mapped.status, 503);
      assert.equal(mapped.body.code, "service_unavailable");
      return true;
    });
  } finally {
    console.error = originalError;
    fs.rmSync(tmp, { force: true });
  }
});
