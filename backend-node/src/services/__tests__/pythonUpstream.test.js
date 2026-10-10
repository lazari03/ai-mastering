import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { postFormData, UpstreamTimeoutError } from "../pythonUpstream.js";

// A local stand-in for the Python service: reads the whole multipart body,
// then answers after `delayMs` (a render only answers when it is done).
function slowServer(delayMs) {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ contentType: req.headers["content-type"], body: Buffer.concat(chunks).toString("latin1") });
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ job_id: "j1" }));
      }, delayMs);
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, received, url: `http://127.0.0.1:${server.address().port}/master` })));
}

test("waits for a slow upstream instead of a fixed short timeout, and delivers the multipart body intact", async () => {
  const { server, received, url } = await slowServer(600);
  try {
    const form = new FormData();
    form.append("genre", "rock");
    form.append("file", new Blob([Buffer.from("RIFF-fake-audio")]), "mix.wav");
    const res = await postFormData(url, form, { timeoutMs: 5000 });
    assert.equal(res.ok, true);
    assert.deepEqual(res.json, { job_id: "j1" });
    assert.match(received[0].contentType, /^multipart\/form-data; boundary=/);
    assert.match(received[0].body, /name="genre"\r\n\r\nrock/);
    assert.match(received[0].body, /filename="mix.wav"[\s\S]*RIFF-fake-audio/);
  } finally {
    server.close();
  }
});

test("a render past the deadline fails with a 504 processing_timeout, not a generic connection error", async () => {
  const { server, url } = await slowServer(2000);
  try {
    await assert.rejects(
      postFormData(url, new FormData(), { timeoutMs: 300 }),
      (error) => error instanceof UpstreamTimeoutError && error.status === 504 && error.code === "processing_timeout",
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("upstream error status and JSON detail are passed through", async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "Server is at capacity" }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await postFormData(`http://127.0.0.1:${server.address().port}/master`, new FormData());
    assert.equal(res.status, 503);
    assert.equal(res.ok, false);
    assert.equal(res.json.detail, "Server is at capacity");
  } finally {
    server.close();
  }
});
