import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routes-rl-"));
process.env.JOBS_DB_PATH = path.join(dir, "jobs.db");
process.env.ANALYTICS_DB_PATH = path.join(dir, "analytics.db");
process.env.ADMIN_API_KEY = "correct-horse-battery-staple";
process.env.MASTERING_ENGINE = "adaptive_python";

const { default: express } = await import("express");
const { default: masteringRoutes } = await import("../masteringRoutes.js");
const { adminKeyFailureLimiter } = await import("../../middleware/rateLimit.js");

const app = express();
app.use((req, _res, next) => {
  req.user = { uid: "u-preview" };
  req.clientIp = "203.0.113.9";
  next();
});
app.use("/", masteringRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

test("/preview-params rejects an oversized analysis field with 413", async () => {
  const res = await fetch(`${base}/preview-params`, {
    method: "POST",
    body: form({ analysis: "x".repeat(300 * 1024), genre: "pop" }),
  });
  assert.equal(res.status, 413);
});

test("/preview-params is rate limited (429 after 120 requests per window)", async () => {
  let last = 0;
  // Missing genre -> cheap 400 that never reaches Python, but still counted.
  for (let i = 0; i < 125; i += 1) {
    const res = await fetch(`${base}/preview-params`, { method: "POST", body: form({ analysis: "{}" }) });
    last = res.status;
    if (res.status === 429) break;
  }
  assert.equal(last, 429);
});

test("/admin/presets/* locks out an IP after repeated wrong admin keys", async () => {
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(`${base}/admin/presets/x`, { method: "DELETE", headers: { "x-admin-key": "wrong" } });
    statuses.push(res.status);
  }
  assert.equal(statuses[0], 403);
  assert.equal(statuses[11], 429);
});

test("adminKeyFailureLimiter does not count successful requests", async () => {
  const a = express();
  a.use((req, _res, next) => {
    req.clientIp = "198.51.100.7";
    next();
  });
  a.get("/ok", adminKeyFailureLimiter, (_req, res) => res.json({ ok: true }));
  const s = a.listen(0);
  try {
    const url = `http://127.0.0.1:${s.address().port}/ok`;
    for (let i = 0; i < 30; i += 1) {
      const res = await fetch(url);
      assert.equal(res.status, 200);
    }
  } finally {
    s.close();
  }
});
