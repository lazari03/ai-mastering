import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

import { guardRouteParams, isValidCodec, isValidExt, isValidJobId, safeJoin, upstreamPath } from "../pathParams.js";

test("accepts well-formed job ids, formats and codecs", () => {
  assert.ok(isValidJobId("0123456789abcdef0123456789abcdef"));
  assert.ok(isValidJobId("realjob01"));
  assert.ok(isValidExt("wav") && isValidExt("mp3"));
  assert.ok(isValidCodec("mp3_128") && isValidCodec("opus_128"));
});

test("rejects malformed job ids, formats and codecs", () => {
  for (const bad of ["*", "0*", "../x", "abc/def12", "a b c d e f", "short", "x".repeat(65), "", undefined, null, 12345678]) {
    assert.equal(isValidJobId(bad), false, String(bad));
  }
  for (const bad of ["exe", "wav/../x", "WAV", "", undefined]) assert.equal(isValidExt(bad), false, String(bad));
  for (const bad of ["../../original/x", "mp3", "mp3_128/..", "", undefined]) assert.equal(isValidCodec(bad), false, String(bad));
});

test("upstreamPath encodes every segment", () => {
  assert.equal(upstreamPath("download-codec-preview", "abc123", "mp3_128"), "/download-codec-preview/abc123/mp3_128");
  assert.equal(upstreamPath("original", "../x"), "/original/..%2Fx");
});

test("safeJoin stays inside its directory", () => {
  assert.equal(safeJoin("/srv/out", "abc123_mastered.wav"), "/srv/out/abc123_mastered.wav");
  assert.throws(() => safeJoin("/srv/out", "../etc/passwd"));
  assert.throws(() => safeJoin("/srv/out", "../out2/x"));
});

test("route param guard rejects malformed path parameters", async () => {
  const router = express.Router();
  guardRouteParams(router);
  let reached = 0;
  const ok = (req, res) => {
    reached += 1;
    res.json({ ok: true });
  };
  router.get("/download-codec-preview/:jobId/:codec", ok);
  router.get("/download/:jobId.:ext", ok);
  router.get("/original/:jobId", ok);
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = async (p) => (await fetch(`${base}${p}`)).status;
  try {
    assert.equal(await status("/download-codec-preview/abc12345/mp3_128"), 200);
    assert.equal(await status("/download/abc12345.wav"), 200);
    assert.equal(await status("/original/abc12345"), 200);
    const before = reached;
    assert.equal(await status("/download-codec-preview/abc12345/a%2Fb"), 404);
    assert.equal(await status("/download-codec-preview/abc12345/not_a_codec"), 404);
    assert.equal(await status("/download-codec-preview/..%2F/mp3_128"), 404);
    assert.equal(await status("/download-codec-preview/abc12345/*"), 404);
    assert.equal(await status("/download/abc12345.exe"), 404);
    assert.equal(await status("/original/*"), 404);
    assert.equal(await status("/original/a%2Fb"), 404);
    assert.equal(await status("/original/a%3Fb"), 404);
    assert.equal(await status(`/original/${"x".repeat(200)}`), 404);
    assert.equal(await status("/original/.."), 404);
    assert.equal(reached, before);
  } finally {
    server.close();
  }
});
