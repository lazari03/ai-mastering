import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import express from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

import { SUPPORTED_UPLOAD_EXTS } from "./config.js";
import { validateAudioFile } from "./audioValidation.js";

// Browser-facing file endpoints for the MCP integration, under /mcp/ on the
// public origin (Caddy routes /mcp* to node-api):
//
//   GET /mcp/upload/:uploadId?token=…   a small upload page the person opens
//                                        from ChatGPT (the "temporary upload
//                                        URL" create_upload returns)
//   PUT /mcp/upload/:uploadId?token=…   the raw upload itself (the page uses
//                                        it; curl -T works too)
//   GET /mcp/download/:jobId?token=…    the finished master
//
// The signed, single-purpose token in the URL is the credential (an S3
// presigned-URL model): it names exactly one upload or one job and expires
// quickly. Nothing here accepts a path or a URL to fetch — the server only
// ever receives bytes the person sends, and only ever streams files it
// produced for that person's job.

const UPLOAD_ID_RE = /^[a-f0-9]{32}$/;
const JOB_ID_RE = /^[A-Za-z0-9]{6,64}$/;

function ipLimiter(limit, windowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.clientIp || req.ip),
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { error: { code: "rate_limited", message: "Too many requests — wait a few minutes and try again." } },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function safeDownloadName(original, ext) {
  const base = path.basename(String(original || "track"), path.extname(String(original || ""))).replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 80) || "track";
  return `${base} (Auralith master).${ext}`;
}

function sendPage(res, status, { title, body, script = "" }) {
  const nonce = crypto.randomBytes(16).toString("base64");
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Auralith Forge</title>
<style>
  :root { --bg:#f6f5f2; --card:#ffffff; --text:#16161a; --muted:#5d5d66; --line:#dcdad4; --accent:#5b4bdb; --ok:#147a3d; --err:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f0f12; --card:#18181d; --text:#ececf1; --muted:#a3a3ad; --line:#2c2c33; --accent:#9d92ff; --ok:#4cc27f; --err:#ff8a7a; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; background:var(--bg); color:var(--text); font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { width:100%; max-width:480px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:24px; }
  h1 { font-size:20px; margin:0 0 6px; }
  p { margin:6px 0; color:var(--muted); }
  .drop { margin-top:16px; border:2px dashed var(--line); border-radius:12px; padding:28px 16px; text-align:center; cursor:pointer; }
  .drop.over { border-color:var(--accent); }
  button { margin-top:16px; width:100%; padding:12px; border:0; border-radius:10px; background:var(--accent); color:#fff; font-size:16px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  progress { width:100%; margin-top:12px; height:10px; }
  .ok { color:var(--ok); } .err { color:var(--err); }
  small { color:var(--muted); }
</style>
</head>
<body><main>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body>
</html>`);
}

const UPLOAD_SCRIPT = `
(function () {
  var input = document.getElementById('file');
  var drop = document.getElementById('drop');
  var btn = document.getElementById('send');
  var bar = document.getElementById('bar');
  var msg = document.getElementById('msg');
  var picked = null;
  function choose(f) { picked = f; drop.textContent = f ? f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)' : 'Choose or drop an audio file'; btn.disabled = !f; msg.textContent = ''; msg.className = ''; }
  drop.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { choose(input.files[0] || null); });
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer.files[0] || null); });
  btn.addEventListener('click', function () {
    if (!picked) return;
    btn.disabled = true; bar.hidden = false; bar.value = 0;
    var xhr = new XMLHttpRequest();
    var url = location.pathname + location.search + '&name=' + encodeURIComponent(picked.name);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) bar.value = e.loaded / e.total; };
    xhr.onload = function () {
      var data = {}; try { data = JSON.parse(xhr.responseText); } catch (err) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        msg.className = 'ok';
        msg.textContent = 'Uploaded. Go back to ChatGPT and tell it the upload is done.';
        drop.hidden = true; btn.hidden = true;
      } else {
        msg.className = 'err';
        msg.textContent = (data.error && data.error.message) || 'Upload failed. Try again.';
        btn.disabled = false;
      }
      bar.hidden = true;
    };
    xhr.onerror = function () { msg.className = 'err'; msg.textContent = 'Network error — check your connection and try again.'; btn.disabled = false; bar.hidden = true; };
    xhr.send(picked);
  });
})();`;

export function createFileRouter({ store, config, signedUrls, uploadDir, jobsService, pythonApiBaseUrl, fetchImpl = fetch, log = console, now = () => Date.now() }) {
  const router = express.Router();
  const pageLimiter = ipLimiter(120, 5 * 60 * 1000);
  const putLimiter = ipLimiter(config.rateLimits.uploadPutsPerIp, 15 * 60 * 1000);
  const downloadLimiter = ipLimiter(config.rateLimits.downloadsPerIp, 5 * 60 * 1000);
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  const accept = SUPPORTED_UPLOAD_EXTS.join(",");

  function checkUploadAccess(req) {
    const { uploadId } = req.params;
    if (!UPLOAD_ID_RE.test(uploadId) || !signedUrls.verifyUpload(req.query.token, uploadId)) return { status: 403, code: "invalid_link", message: "This upload link is invalid or has expired. Ask ChatGPT for a new one." };
    const upload = store.getUpload(uploadId);
    if (!upload) return { status: 404, code: "upload_not_found", message: "This upload no longer exists. Ask ChatGPT for a new link." };
    if (upload.status === "uploaded") return { status: 409, code: "already_uploaded", message: "A file was already uploaded with this link. Go back to ChatGPT to continue.", upload };
    if (upload.status !== "pending" || upload.url_expires_at < now()) return { status: 410, code: "upload_expired", message: "This upload link has expired. Ask ChatGPT for a new one." };
    return { upload };
  }

  router.get("/mcp/upload/:uploadId", pageLimiter, (req, res) => {
    const access = checkUploadAccess(req);
    if (!access.upload || access.status) {
      const done = access.code === "already_uploaded";
      return sendPage(res, done ? 200 : access.status, {
        title: done ? "Upload complete" : "Link unavailable",
        body: `<h1>${done ? "Upload complete" : "This link can't be used"}</h1><p class="${done ? "ok" : "err"}">${escapeHtml(access.message)}</p>`,
      });
    }
    const lastError = access.upload.reject_message ? `<p class="err">Last attempt: ${escapeHtml(access.upload.reject_message)}</p>` : "";
    return sendPage(res, 200, {
      title: "Upload a track",
      body: `<h1>Upload a track to master</h1>
<p>Auralith Forge will master it with your account's plan, then ChatGPT shows you the result.</p>
<p><small>WAV, AIFF, FLAC, MP3, AAC/M4A, OGG, WMA or WebM · up to ${config.maxUploadMb} MB · up to ${config.maxDurationMinutes} minutes. Link expires ${escapeHtml(new Date(access.upload.url_expires_at).toUTCString())}.</small></p>
${lastError}
<input id="file" type="file" accept="${escapeHtml(accept)},audio/*" hidden>
<div id="drop" class="drop" role="button" tabindex="0">Choose or drop an audio file</div>
<progress id="bar" max="1" value="0" hidden></progress>
<button id="send" disabled>Upload</button>
<p id="msg" role="status" aria-live="polite"></p>`,
      script: UPLOAD_SCRIPT,
    });
  });

  router.put("/mcp/upload/:uploadId", putLimiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const deny = (status, code, message) => res.status(status).json({ error: { code, message } });
    const access = checkUploadAccess(req);
    if (!access.upload || access.status) return deny(access.status, access.code, access.message);
    const upload = access.upload;

    const name = path.basename(String(req.query.name || upload.filename || "")).slice(0, 200);
    const ext = path.extname(name).toLowerCase();
    if (!SUPPORTED_UPLOAD_EXTS.includes(ext)) {
      return deny(415, "unsupported_format", `Unsupported file type "${ext || "none"}". Upload WAV, AIFF, FLAC, MP3, AAC/M4A, OGG, WMA or WebM.`);
    }
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return deny(413, "file_too_large", `That file is larger than ${config.maxUploadMb} MB. Export a shorter or compressed version and try again.`);
    }
    if (!store.claimUploadForReceiving(upload.upload_id)) {
      return deny(409, "upload_in_progress", "Another upload is already using this link. Wait for it to finish or ask ChatGPT for a new link.");
    }

    const filePath = path.join(uploadDir, `mcp_${upload.upload_id}${ext}`);
    const fail = (status, code, message) => {
      fs.unlink(filePath, () => {});
      store.setUploadError(upload.upload_id, code, message);
      return deny(status, code, message);
    };

    let received = 0;
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length;
          if (received > maxBytes) return cb(Object.assign(new Error("too large"), { code: "file_too_large" }));
          cb(null, chunk);
        },
      });
      await pipeline(req, counter, fs.createWriteStream(filePath, { flags: "w", mode: 0o600 }));
    } catch (error) {
      if (error?.code === "file_too_large") {
        res.setHeader("Connection", "close");
        return fail(413, "file_too_large", `That file is larger than ${config.maxUploadMb} MB. Export a shorter or compressed version and try again.`);
      }
      log.error?.(`MCP upload ${upload.upload_id} failed while receiving:`, error?.message);
      return fail(400, "upload_interrupted", "The upload was interrupted. Try again.");
    }

    let verdict;
    try {
      verdict = await validateAudioFile(filePath, ext, { maxDurationMinutes: config.maxDurationMinutes });
    } catch (error) {
      log.error?.(`MCP upload ${upload.upload_id} validation error:`, error?.message);
      return fail(400, "unreadable_file", "That file couldn't be read. Export it again and retry.");
    }
    if (!verdict.ok) return fail(verdict.code === "too_long" ? 413 : 415, verdict.code, verdict.message);

    const t = now();
    const ok = store.markUploaded({
      upload_id: upload.upload_id,
      filename: name || `track${ext}`,
      ext,
      file_path: filePath,
      size_bytes: received,
      duration_s: verdict.durationS ?? null,
      format: verdict.family,
      uploaded_at: t,
      expires_at: t + config.uploadRetentionS * 1000,
    });
    if (!ok) {
      fs.unlink(filePath, () => {});
      return deny(409, "upload_conflict", "This upload changed while it was being received. Ask ChatGPT for a new link.");
    }
    return res.status(201).json({
      upload_id: upload.upload_id,
      status: "uploaded",
      size_bytes: received,
      duration_s: verdict.durationS ?? null,
      format: verdict.family,
      message: "Uploaded. Go back to ChatGPT and tell it the upload is done.",
    });
  });

  router.get("/mcp/download/:jobId", downloadLimiter, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const notFound = () => res.status(404).json({ error: { code: "not_found", message: "This download link is invalid or has expired. Ask ChatGPT for a fresh link." } });
    const { jobId } = req.params;
    if (!JOB_ID_RE.test(jobId)) return notFound();
    const claim = signedUrls.verifyDownload(req.query.token, jobId);
    if (!claim) return notFound();
    const job = store.getJobForUser(jobId, claim.uid);
    if (!job || job.status !== "completed") return notFound();
    // The website's job record carries the 48h file expiry; files past it
    // are gone (or about to be) regardless of the token.
    const record = await jobsService.getJob(claim.uid, jobId).catch(() => null);
    const expires = record?.expires_at ? Date.parse(record.expires_at) : NaN;
    if (!record || !Number.isFinite(expires) || expires <= now()) {
      return res.status(410).json({ error: { code: "result_expired", message: "This master has expired (files are kept for 48 hours). Master the track again to get a new file." } });
    }
    const summary = JSON.parse(job.result || "{}");
    const ext = summary.output_format === "mp3" ? "mp3" : "wav";
    let upstream;
    try {
      upstream = await fetchImpl(`${pythonApiBaseUrl}/download/${encodeURIComponent(jobId)}.${ext}`, req.headers.range ? { headers: { Range: req.headers.range } } : undefined);
    } catch (error) {
      log.error?.(`MCP download ${jobId}: Python unreachable:`, error?.message);
      return res.status(503).json({ error: { code: "service_unavailable", message: "Downloads are temporarily unavailable. Try again in a minute." } });
    }
    if (!upstream.ok && upstream.status !== 206) return upstream.status === 404 ? notFound() : res.status(502).json({ error: { code: "download_failed", message: "The file couldn't be fetched. Try again." } });
    res.status(upstream.status);
    res.setHeader("Content-Type", ext === "wav" ? "audio/wav" : "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName(job.original_filename, ext).replace(/"/g, "")}"`);
    for (const header of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    const body = Readable.fromWeb(upstream.body);
    body.on("error", (error) => {
      log.error?.(`MCP download ${jobId} stream error:`, error.message);
      res.destroy(error);
    });
    return body.pipe(res);
  });

  return router;
}
