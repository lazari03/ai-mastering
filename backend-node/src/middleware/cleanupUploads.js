import fs from "node:fs";
import path from "node:path";

import { settings } from "../config/settings.js";

// Multer writes every upload to settings.uploadDir before a route forwards
// it to the Python service. That directory lives inside this container,
// not on the shared volume the Python service's 48h sweep covers, so a
// route that didn't unlink its own temp file (/master's source and
// reference, /analyze-chords) left user audio on disk until the next
// redeploy — longer than the Privacy Policy's 48-hour promise.
//
// Attach after the multer middleware: once the response has finished (or
// the client went away), every file multer stored for this request is
// removed. Python keeps its own copy for the job's lifetime.
function filesOf(req) {
  const out = [];
  if (req.file?.path) out.push(req.file.path);
  if (req.files) {
    const groups = Array.isArray(req.files) ? [req.files] : Object.values(req.files);
    for (const group of groups) for (const f of group || []) if (f?.path) out.push(f.path);
  }
  return out;
}

export function cleanupUploadsOnFinish(req, res, next) {
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    for (const p of filesOf(req)) fs.unlink(p, () => {});
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
}

// Backstop for anything that slipped through (a crash mid-request), run
// hourly. Multer's own temp files (random names) go after two hours —
// renders take minutes, so nothing in flight is that old. Job-owned files
// ("<jobId>_input.*", kept by the legacy ffmpeg engine to play back the
// original) follow the same 48h retention as everything else.
const TEMP_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const JOB_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const JOB_FILE = /^[0-9a-f]{8}(-[0-9a-f-]{27})?_/i; // legacy engine uses an 8-char job id
export function startUploadSweep() {
  const sweep = () => {
    let names = [];
    try {
      names = fs.readdirSync(settings.uploadDir);
    } catch {
      return;
    }
    const now = Date.now();
    for (const name of names) {
      const full = path.join(settings.uploadDir, name);
      const cutoff = now - (JOB_FILE.test(name) ? JOB_MAX_AGE_MS : TEMP_MAX_AGE_MS);
      fs.stat(full, (err, st) => {
        if (!err && st.isFile() && st.mtimeMs < cutoff) fs.unlink(full, () => {});
      });
    }
  };
  sweep();
  return setInterval(sweep, 60 * 60 * 1000).unref();
}
