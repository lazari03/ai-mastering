import crypto from "node:crypto";

import jobsDb from "../config/jobsDb.js";

// Public share links for a single mastered file.
//
// Model (the standard one for secret links — Dropbox/Drive-style shares,
// GitHub-style tokens):
//
// * The credential is an OPAQUE random token: 32 bytes from the CSPRNG
//   (256 bits), base64url, with a recognisable "afs_" prefix so secret
//   scanners and humans can identify a leaked one. It encodes nothing —
//   no uid, no job id, no expiry to decode or tamper with.
// * Only SHA-256(token) is stored. A database leak exposes no usable
//   links, and the raw token is shown exactly once, at creation.
// * Every property that matters is server-side state, checked on every
//   request: expiry (user-chosen, always capped at the master's own
//   expiry), revocation, optional download limit. That is what makes a
//   link revocable and auditable, which a self-contained signed token
//   (the previous implementation) cannot be.
// * The link carries the token in the URL FRAGMENT (/share#afs_...). Browsers
//   never send the fragment to any server, so it stays out of access
//   logs, analytics page paths and Referer headers; the share page sends
//   it to the API in the X-Share-Token header instead.

export const TOKEN_PREFIX = "afs_";
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^afs_[A-Za-z0-9_-]{43}$/;

export const MIN_EXPIRY_SECONDS = 5 * 60;
export const MAX_DOWNLOADS_LIMIT = 1000;
export const MAX_ACTIVE_LINKS_PER_JOB = 10;
// Expired/revoked rows are kept this long for the owner's link history
// and support questions, then purged.
const RETENTION_AFTER_END_MS = 7 * 24 * 3600 * 1000;

export class ShareLinkError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken() {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isWellFormedToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function linkStatus(row, nowMs) {
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.expires_at) <= nowMs) return "expired";
  if (row.max_downloads != null && row.download_count >= row.max_downloads) return "exhausted";
  return "active";
}

function publicView(row, nowMs) {
  return {
    id: row.id,
    job_id: row.job_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    max_downloads: row.max_downloads,
    download_count: row.download_count,
    last_accessed_at: row.last_accessed_at,
    status: linkStatus(row, nowMs),
  };
}

export function createShareLinkStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      uid TEXT NOT NULL,
      job_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      max_downloads INTEGER,
      download_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_share_links_owner_job ON share_links(uid, job_id);
    CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at);
  `);

  const insertStmt = db.prepare(`
    INSERT INTO share_links (id, token_hash, uid, job_id, created_at, expires_at, max_downloads)
    VALUES (@id, @token_hash, @uid, @job_id, @created_at, @expires_at, @max_downloads)
  `);
  const byHashStmt = db.prepare("SELECT * FROM share_links WHERE token_hash = ?");
  const listStmt = db.prepare("SELECT * FROM share_links WHERE uid = ? AND job_id = ? ORDER BY created_at DESC");
  const countActiveStmt = db.prepare(`
    SELECT COUNT(*) AS n FROM share_links
    WHERE uid = ? AND job_id = ? AND revoked_at IS NULL AND expires_at > ?
      AND (max_downloads IS NULL OR download_count < max_downloads)
  `);
  const revokeStmt = db.prepare("UPDATE share_links SET revoked_at = ? WHERE id = ? AND uid = ? AND revoked_at IS NULL");
  const revokeJobStmt = db.prepare("UPDATE share_links SET revoked_at = ? WHERE uid = ? AND job_id = ? AND revoked_at IS NULL");
  const deleteUserStmt = db.prepare("DELETE FROM share_links WHERE uid = ?");
  const touchStmt = db.prepare("UPDATE share_links SET last_accessed_at = ? WHERE id = ?");
  // Atomic check-and-increment: two concurrent downloads of a 1-download
  // link cannot both pass.
  const consumeStmt = db.prepare(`
    UPDATE share_links SET download_count = download_count + 1, last_accessed_at = @now
    WHERE id = @id AND revoked_at IS NULL AND expires_at > @now
      AND (max_downloads IS NULL OR download_count < max_downloads)
  `);
  const purgeStmt = db.prepare("DELETE FROM share_links WHERE expires_at < @cutoff OR (revoked_at IS NOT NULL AND revoked_at < @cutoff)");

  return {
    /**
     * Mint a link. Returns the raw token exactly once.
     * expiresInSeconds: null/undefined = until the master expires.
     */
    create({ uid, jobId, jobExpiresAt, expiresInSeconds = null, maxDownloads = null, now = Date.now() }) {
      const jobExpiryMs = Date.parse(jobExpiresAt);
      if (!Number.isFinite(jobExpiryMs) || jobExpiryMs <= now) {
        throw new ShareLinkError(410, "This master has already expired and can't be shared anymore.");
      }
      let expiresMs = jobExpiryMs;
      if (expiresInSeconds != null) {
        const secs = Number(expiresInSeconds);
        if (!Number.isInteger(secs) || secs < MIN_EXPIRY_SECONDS) {
          throw new ShareLinkError(400, `expires_in_seconds must be a whole number of at least ${MIN_EXPIRY_SECONDS}.`);
        }
        expiresMs = Math.min(jobExpiryMs, now + secs * 1000);
      }
      if (maxDownloads != null) {
        const n = Number(maxDownloads);
        if (!Number.isInteger(n) || n < 1 || n > MAX_DOWNLOADS_LIMIT) {
          throw new ShareLinkError(400, `max_downloads must be between 1 and ${MAX_DOWNLOADS_LIMIT}.`);
        }
        maxDownloads = n;
      }
      if (countActiveStmt.get(uid, jobId, toIso(now)).n >= MAX_ACTIVE_LINKS_PER_JOB) {
        throw new ShareLinkError(429, `This master already has ${MAX_ACTIVE_LINKS_PER_JOB} active share links. Revoke one first.`);
      }
      purgeStmt.run({ cutoff: toIso(now - RETENTION_AFTER_END_MS) });

      const token = generateToken();
      const row = {
        id: `shl_${crypto.randomBytes(12).toString("base64url")}`,
        token_hash: hashToken(token),
        uid,
        job_id: jobId,
        created_at: toIso(now),
        expires_at: toIso(expiresMs),
        max_downloads: maxDownloads ?? null,
      };
      insertStmt.run(row);
      return { token, link: publicView({ ...row, revoked_at: null, download_count: 0, last_accessed_at: null }, now) };
    },

    /**
     * Look a presented token up. Never throws on bad input — anything
     * malformed is simply "not_found" (no DB query for garbage).
     */
    resolve(token, now = Date.now()) {
      if (!isWellFormedToken(token)) return { status: "not_found" };
      const row = byHashStmt.get(hashToken(token));
      if (!row) return { status: "not_found" };
      const status = linkStatus(row, now);
      return { status, row, link: publicView(row, now) };
    },

    touch(id, now = Date.now()) {
      touchStmt.run(toIso(now), id);
    },

    /** Count one download; false if the link can no longer be used. */
    consumeDownload(id, now = Date.now()) {
      return consumeStmt.run({ id, now: toIso(now) }).changes > 0;
    },

    list(uid, jobId, now = Date.now()) {
      return listStmt.all(uid, jobId).map((row) => publicView(row, now));
    },

    revoke(uid, id, now = Date.now()) {
      return revokeStmt.run(toIso(now), id, uid).changes > 0;
    },

    revokeAllForJob(uid, jobId, now = Date.now()) {
      return revokeJobStmt.run(toIso(now), uid, jobId).changes;
    },

    deleteAllForUser(uid) {
      return deleteUserStmt.run(uid).changes;
    },
  };
}

export const shareLinks = createShareLinkStore(jobsDb);
