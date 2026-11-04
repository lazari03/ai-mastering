import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import Database from "better-sqlite3";

// Local SQLite store for the MCP integration — same reasoning as jobsDb.js
// (moved off Firestore to stay inside its free write quota): every OAuth
// code, token rotation, upload and job state change is a write, and none of
// it needs to be in Firestore. Firestore stays the store for what is
// already there (users, quotas, renderReservations — the billing ledger is
// reused untouched). node-api runs as a single instance (docker-compose),
// and better-sqlite3 is synchronous, so a db.transaction() is atomic
// against every other request in this process.
//
// Only SHA-256 hashes of tokens, codes and upload secrets are stored.

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function randomToken(prefix, bytes = 32) {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
}

export function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS oauth_pending (
    request_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    state TEXT,
    scopes TEXT NOT NULL,
    resource TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    email TEXT,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    scopes TEXT NOT NULL,
    resource TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS oauth_grants (
    grant_id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    email TEXT,
    client_id TEXT NOT NULL,
    scopes TEXT NOT NULL,
    resource TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    revoked_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_grants_uid ON oauth_grants(uid);
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
    grant_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant ON oauth_tokens(grant_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS mcp_uploads (
    upload_id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    filename TEXT NOT NULL,
    ext TEXT NOT NULL,
    declared_bytes INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'receiving', 'uploaded', 'rejected', 'expired')),
    reject_code TEXT,
    reject_message TEXT,
    file_path TEXT,
    size_bytes INTEGER,
    duration_s REAL,
    format TEXT,
    created_at INTEGER NOT NULL,
    url_expires_at INTEGER NOT NULL,
    uploaded_at INTEGER,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_uploads_uid ON mcp_uploads(uid, status);
  CREATE INDEX IF NOT EXISTS idx_mcp_uploads_expires ON mcp_uploads(expires_at);

  CREATE TABLE IF NOT EXISTS mcp_jobs (
    job_id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    settings TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    error_code TEXT,
    error_message TEXT,
    retryable INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    original_filename TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    UNIQUE (uid, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_jobs_uid ON mcp_jobs(uid, status);
`;

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createMcpStore({ dbPath, now = () => Date.now() } = {}) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const q = {
    // clients
    insertClient: db.prepare("INSERT INTO oauth_clients (client_id, client_secret_hash, metadata, created_at) VALUES (?, ?, ?, ?)"),
    getClient: db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?"),
    countClients: db.prepare("SELECT COUNT(*) AS n FROM oauth_clients"),
    touchClient: db.prepare("UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?"),
    // pending authorization requests
    insertPending: db.prepare(
      "INSERT INTO oauth_pending (request_id, client_id, redirect_uri, code_challenge, state, scopes, resource, created_at, expires_at) VALUES (@request_id, @client_id, @redirect_uri, @code_challenge, @state, @scopes, @resource, @created_at, @expires_at)",
    ),
    getPending: db.prepare("SELECT * FROM oauth_pending WHERE request_id = ?"),
    deletePending: db.prepare("DELETE FROM oauth_pending WHERE request_id = ?"),
    // codes
    insertCode: db.prepare(
      "INSERT INTO oauth_codes (code_hash, client_id, uid, email, redirect_uri, code_challenge, scopes, resource, expires_at) VALUES (@code_hash, @client_id, @uid, @email, @redirect_uri, @code_challenge, @scopes, @resource, @expires_at)",
    ),
    getCode: db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?"),
    useCode: db.prepare("UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL"),
    // grants + tokens
    insertGrant: db.prepare(
      "INSERT INTO oauth_grants (grant_id, uid, email, client_id, scopes, resource, created_at, expires_at) VALUES (@grant_id, @uid, @email, @client_id, @scopes, @resource, @created_at, @expires_at)",
    ),
    getGrant: db.prepare("SELECT * FROM oauth_grants WHERE grant_id = ?"),
    revokeGrant: db.prepare("UPDATE oauth_grants SET revoked_at = ?, revoked_reason = ? WHERE grant_id = ? AND revoked_at IS NULL"),
    revokeGrantsForUser: db.prepare("UPDATE oauth_grants SET revoked_at = ?, revoked_reason = ? WHERE uid = ? AND revoked_at IS NULL"),
    insertToken: db.prepare("INSERT INTO oauth_tokens (token_hash, kind, grant_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"),
    getToken: db.prepare(
      "SELECT t.*, g.uid, g.email, g.client_id, g.scopes, g.resource, g.created_at AS grant_created_at, g.expires_at AS grant_expires_at, g.revoked_at FROM oauth_tokens t JOIN oauth_grants g ON g.grant_id = t.grant_id WHERE t.token_hash = ?",
    ),
    useToken: db.prepare("UPDATE oauth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL"),
    deleteTokensForGrant: db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?"),
    // housekeeping
    purgePending: db.prepare("DELETE FROM oauth_pending WHERE expires_at < ?"),
    purgeCodes: db.prepare("DELETE FROM oauth_codes WHERE expires_at < ?"),
    purgeTokens: db.prepare("DELETE FROM oauth_tokens WHERE expires_at < ?"),
    purgeGrants: db.prepare("DELETE FROM oauth_grants WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)"),
    // uploads
    insertUpload: db.prepare(
      "INSERT INTO mcp_uploads (upload_id, uid, filename, ext, declared_bytes, status, created_at, url_expires_at, expires_at) VALUES (@upload_id, @uid, @filename, @ext, @declared_bytes, 'pending', @created_at, @url_expires_at, @expires_at)",
    ),
    getUpload: db.prepare("SELECT * FROM mcp_uploads WHERE upload_id = ?"),
    getUploadForUser: db.prepare("SELECT * FROM mcp_uploads WHERE upload_id = ? AND uid = ?"),
    claimUploadForReceiving: db.prepare("UPDATE mcp_uploads SET status = 'receiving' WHERE upload_id = ? AND status = 'pending' AND url_expires_at >= ?"),
    resetUploadToPending: db.prepare("UPDATE mcp_uploads SET status = 'pending' WHERE upload_id = ? AND status = 'receiving'"),
    markUploaded: db.prepare(
      "UPDATE mcp_uploads SET status = 'uploaded', filename = @filename, ext = @ext, file_path = @file_path, size_bytes = @size_bytes, duration_s = @duration_s, format = @format, uploaded_at = @uploaded_at, expires_at = @expires_at, reject_code = NULL, reject_message = NULL WHERE upload_id = @upload_id AND status = 'receiving'",
    ),
    // A failed attempt (too big, not audio, too long) puts the upload back
    // to 'pending' with the reason, so the person can pick another file on
    // the same link while it is still valid.
    setUploadError: db.prepare("UPDATE mcp_uploads SET status = 'pending', reject_code = ?, reject_message = ? WHERE upload_id = ? AND status = 'receiving'"),
    markRejected: db.prepare("UPDATE mcp_uploads SET status = 'rejected', reject_code = ?, reject_message = ?, file_path = NULL WHERE upload_id = ? AND status IN ('pending', 'receiving')"),
    countOpenUploads: db.prepare("SELECT COUNT(*) AS n FROM mcp_uploads WHERE uid = ? AND status IN ('pending', 'receiving', 'uploaded') AND expires_at >= ?"),
    expiredUploads: db.prepare("SELECT * FROM mcp_uploads WHERE status IN ('pending', 'receiving', 'uploaded') AND (expires_at < ? OR (status = 'pending' AND url_expires_at < ?)) LIMIT 500"),
    markExpired: db.prepare("UPDATE mcp_uploads SET status = 'expired', file_path = NULL WHERE upload_id = ?"),
    purgeUploads: db.prepare("DELETE FROM mcp_uploads WHERE status IN ('expired', 'rejected') AND expires_at < ?"),
    uploadsForUser: db.prepare("SELECT * FROM mcp_uploads WHERE uid = ?"),
    deleteUploadsForUser: db.prepare("DELETE FROM mcp_uploads WHERE uid = ?"),
    // jobs
    getJobByKey: db.prepare("SELECT * FROM mcp_jobs WHERE uid = ? AND idempotency_key = ?"),
    retireKey: db.prepare("UPDATE mcp_jobs SET idempotency_key = idempotency_key || ':retired:' || job_id WHERE job_id = ?"),
    insertJob: db.prepare(
      "INSERT INTO mcp_jobs (job_id, uid, upload_id, idempotency_key, settings, status, original_filename, created_at) VALUES (@job_id, @uid, @upload_id, @idempotency_key, @settings, 'queued', @original_filename, @created_at)",
    ),
    getJob: db.prepare("SELECT * FROM mcp_jobs WHERE job_id = ?"),
    getJobForUser: db.prepare("SELECT * FROM mcp_jobs WHERE job_id = ? AND uid = ?"),
    countActiveJobs: db.prepare("SELECT COUNT(*) AS n FROM mcp_jobs WHERE uid = ? AND status IN ('queued', 'processing')"),
    markProcessing: db.prepare("UPDATE mcp_jobs SET status = 'processing', started_at = ? WHERE job_id = ? AND status = 'queued'"),
    markCompleted: db.prepare("UPDATE mcp_jobs SET status = 'completed', result = ?, finished_at = ?, error_code = NULL, error_message = NULL WHERE job_id = ? AND status IN ('queued', 'processing')"),
    markFailed: db.prepare("UPDATE mcp_jobs SET status = 'failed', error_code = ?, error_message = ?, retryable = ?, finished_at = ? WHERE job_id = ? AND status IN ('queued', 'processing')"),
    activeJobs: db.prepare("SELECT * FROM mcp_jobs WHERE status IN ('queued', 'processing')"),
    deleteJobsForUser: db.prepare("DELETE FROM mcp_jobs WHERE uid = ?"),
    purgeJobs: db.prepare("DELETE FROM mcp_jobs WHERE status IN ('completed', 'failed') AND created_at < ?"),
  };

  const clientRow = (row) => {
    if (!row) return undefined;
    return { ...parseJson(row.metadata, {}), client_id: row.client_id, _secret_hash: row.client_secret_hash };
  };

  const store = {
    db,
    close: () => db.close(),

    // ---- OAuth clients --------------------------------------------------
    insertClient(client, secretHash) {
      q.insertClient.run(client.client_id, secretHash || null, JSON.stringify(client), now());
    },
    getClient: (clientId) => clientRow(q.getClient.get(String(clientId))),
    countClients: () => q.countClients.get().n,
    touchClient: (clientId) => q.touchClient.run(now(), clientId),

    // ---- Pending authorization requests (between /authorize and consent)
    insertPending: (p) => q.insertPending.run(p),
    getPending(requestId) {
      const row = q.getPending.get(String(requestId));
      if (!row || row.expires_at < now()) return null;
      return { ...row, scopes: parseJson(row.scopes, []) };
    },
    // Single use: read and delete atomically so a request can't be approved twice.
    takePending: db.transaction((requestId) => {
      const row = q.getPending.get(String(requestId));
      if (!row) return null;
      q.deletePending.run(String(requestId));
      if (row.expires_at < now()) return null;
      return { ...row, scopes: parseJson(row.scopes, []) };
    }),

    // ---- Authorization codes -------------------------------------------
    insertCode: (c) => q.insertCode.run(c),
    getCode(codeHash) {
      const row = q.getCode.get(codeHash);
      return row ? { ...row, scopes: parseJson(row.scopes, []) } : null;
    },
    // Returns the code row if THIS call consumed it; null if unknown,
    // expired or already used (RFC 6749 §4.1.2: single use).
    consumeCode: db.transaction((codeHash) => {
      const row = q.getCode.get(codeHash);
      if (!row) return { status: "unknown" };
      if (row.used_at) return { status: "reused", row: { ...row, scopes: parseJson(row.scopes, []) } };
      if (row.expires_at < now()) return { status: "expired" };
      q.useCode.run(now(), codeHash);
      return { status: "ok", row: { ...row, scopes: parseJson(row.scopes, []) } };
    }),

    // ---- Grants and tokens ---------------------------------------------
    insertGrant: (g) => q.insertGrant.run(g),
    getGrant: (grantId) => q.getGrant.get(grantId) || null,
    revokeGrant: (grantId, reason) => {
      const changed = q.revokeGrant.run(now(), String(reason || "revoked"), grantId).changes;
      q.deleteTokensForGrant.run(grantId);
      return changed > 0;
    },
    revokeGrantsForUser: db.transaction((uid, reason) => {
      const grants = db.prepare("SELECT grant_id FROM oauth_grants WHERE uid = ? AND revoked_at IS NULL").all(uid);
      q.revokeGrantsForUser.run(now(), String(reason || "revoked"), uid);
      for (const g of grants) q.deleteTokensForGrant.run(g.grant_id);
      return grants.length;
    }),
    insertToken: (hash, kind, grantId, expiresAt) => q.insertToken.run(hash, kind, grantId, expiresAt, now()),
    getToken(hash) {
      const row = q.getToken.get(hash);
      return row ? { ...row, scopes: parseJson(row.scopes, []) } : null;
    },
    // Marks a refresh token used exactly once. Returns false if it was
    // already used (rotation replay → caller revokes the whole grant).
    useToken: (hash) => q.useToken.run(now(), hash).changes > 0,

    // ---- Uploads ---------------------------------------------------------
    insertUpload: (u) => q.insertUpload.run(u),
    getUpload: (uploadId) => q.getUpload.get(String(uploadId)) || null,
    getUploadForUser: (uploadId, uid) => q.getUploadForUser.get(String(uploadId), uid) || null,
    claimUploadForReceiving: (uploadId) => q.claimUploadForReceiving.run(uploadId, now()).changes > 0,
    resetUploadToPending: (uploadId) => q.resetUploadToPending.run(uploadId).changes > 0,
    markUploaded: (u) => q.markUploaded.run(u).changes > 0,
    markUploadRejected: (uploadId, code, message) => q.markRejected.run(code, message, uploadId).changes > 0,
    setUploadError: (uploadId, code, message) => q.setUploadError.run(code, message, uploadId).changes > 0,
    countOpenUploads: (uid) => q.countOpenUploads.get(uid, now()).n,
    expiredUploads: () => q.expiredUploads.all(now(), now()),
    markUploadExpired: (uploadId) => q.markExpired.run(uploadId),
    uploadsForUser: (uid) => q.uploadsForUser.all(uid),

    // ---- Jobs ------------------------------------------------------------
    // Atomic claim of an idempotency key. Returns { job, created }. A key
    // whose last job FAILED is retired so the same request can be retried
    // (its reservation was refunded); any other existing job is returned as
    // is — a duplicate submission never renders or charges twice.
    claimJob: db.transaction(({ jobId, uid, uploadId, idempotencyKey, settings, originalFilename, maxActive = Infinity }) => {
      const existing = q.getJobByKey.get(uid, idempotencyKey);
      if (existing && existing.status !== "failed") return { job: existing, created: false };
      if (q.countActiveJobs.get(uid).n >= maxActive) return { job: null, created: false, tooMany: true };
      if (existing) q.retireKey.run(existing.job_id);
      q.insertJob.run({
        job_id: jobId,
        uid,
        upload_id: uploadId,
        idempotency_key: idempotencyKey,
        settings: JSON.stringify(settings),
        original_filename: originalFilename || null,
        created_at: now(),
      });
      return { job: q.getJob.get(jobId), created: true };
    }),
    getJob: (jobId) => q.getJob.get(String(jobId)) || null,
    getJobByKey: (uid, key) => q.getJobByKey.get(uid, key) || null,
    getJobForUser: (jobId, uid) => q.getJobForUser.get(String(jobId), uid) || null,
    countActiveJobs: (uid) => q.countActiveJobs.get(uid).n,
    markJobProcessing: (jobId) => q.markProcessing.run(now(), jobId).changes > 0,
    markJobCompleted: (jobId, result) => q.markCompleted.run(JSON.stringify(result), now(), jobId).changes > 0,
    markJobFailed: (jobId, code, message, retryable = false) => q.markFailed.run(code, message, retryable ? 1 : 0, now(), jobId).changes > 0,
    activeJobs: () => q.activeJobs.all(),

    // ---- Account lifecycle ----------------------------------------------
    // DELETE /account: grants revoked, upload/job rows removed. Returns the
    // upload file paths so the caller can unlink them.
    deleteAllForUser: db.transaction((uid) => {
      const files = q.uploadsForUser.all(uid).map((u) => u.file_path).filter(Boolean);
      store.revokeGrantsForUser(uid, "account_deleted");
      q.deleteUploadsForUser.run(uid);
      q.deleteJobsForUser.run(uid);
      return files;
    }),

    purge({ jobRetentionMs = 30 * 86400000 } = {}) {
      const t = now();
      return {
        pending: q.purgePending.run(t).changes,
        codes: q.purgeCodes.run(t - 3600_000).changes,
        tokens: q.purgeTokens.run(t).changes,
        grants: q.purgeGrants.run(t, t - 30 * 86400000).changes,
        uploads: q.purgeUploads.run(t - 86400000).changes,
        jobs: q.purgeJobs.run(t - jobRetentionMs).changes,
      };
    },
  };
  return store;
}
