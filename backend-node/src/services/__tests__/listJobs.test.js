import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobsdb-"));
process.env.JOBS_DB_PATH = path.join(dir, "jobs.db");
const { recordJob, listJobs, ownsJob } = await import("../jobsService.js");

test("a paid master stays in My Masters after many newer previews", async () => {
  const uid = "u-many-previews";
  await recordJob(uid, { job_id: "a".repeat(32), genre: "pop" });
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 60; i += 1) {
    await recordJob(uid, { job_id: `p${String(i).padStart(31, "0")}`, preview: true });
  }
  const jobs = await listJobs(uid, 25);
  assert.deepEqual(jobs.map((j) => j.job_id), ["a".repeat(32)]);
  // Previews still count for ownership (their downloads must keep working).
  assert.equal(await ownsJob(uid, `p${"0".repeat(31)}`), true);
  fs.rmSync(dir, { recursive: true, force: true });
});
