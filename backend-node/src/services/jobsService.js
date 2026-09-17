import jobsDb from "../config/jobsDb.js";

// Mastering job history — recorded after a /master render completes so a
// user can revisit "what did I upload and what came back" later (the "My
// Masters" tab), even after a page reload wipes the in-memory result. This
// tracks metadata only, never audio — the actual files still expire on
// their normal 48h retention window (see backend/app/core/storage_cleanup.py);
// a job entry outliving its files just means the download links go stale,
// which the frontend surfaces via expires_at rather than something this
// service needs to prevent.
const RETENTION_HOURS = 48;

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function fromJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowToJob(row) {
  if (!row) return null;
  return {
    job_id: row.job_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    genre: row.genre,
    style: row.style,
    tier: row.tier,
    output_format: row.output_format,
    original_filename: row.original_filename,
    before_lufs: row.before_lufs,
    after_lufs: row.after_lufs,
    preview: Boolean(row.preview),
    analysis_before: fromJson(row.analysis_before),
    analysis_after: fromJson(row.analysis_after),
    ab_gain_match: fromJson(row.ab_gain_match),
    processing_applied: fromJson(row.processing_applied),
    target_profile_used: fromJson(row.target_profile_used),
    source_warnings: fromJson(row.source_warnings) || [],
    quality_control: fromJson(row.quality_control),
  };
}

const upsertStmt = jobsDb.prepare(`
  INSERT INTO jobs (
    uid, job_id, created_at, expires_at, genre, style, tier, output_format,
    original_filename, before_lufs, after_lufs, preview, analysis_before,
    analysis_after, ab_gain_match, processing_applied, target_profile_used,
    source_warnings, quality_control
  ) VALUES (
    @uid, @job_id, @created_at, @expires_at, @genre, @style, @tier, @output_format,
    @original_filename, @before_lufs, @after_lufs, @preview, @analysis_before,
    @analysis_after, @ab_gain_match, @processing_applied, @target_profile_used,
    @source_warnings, @quality_control
  )
  ON CONFLICT (uid, job_id) DO UPDATE SET
    created_at = excluded.created_at, expires_at = excluded.expires_at,
    genre = excluded.genre, style = excluded.style, tier = excluded.tier,
    output_format = excluded.output_format, original_filename = excluded.original_filename,
    before_lufs = excluded.before_lufs, after_lufs = excluded.after_lufs,
    preview = excluded.preview, analysis_before = excluded.analysis_before,
    analysis_after = excluded.analysis_after, ab_gain_match = excluded.ab_gain_match,
    processing_applied = excluded.processing_applied, target_profile_used = excluded.target_profile_used,
    source_warnings = excluded.source_warnings, quality_control = excluded.quality_control
`);

const getJobStmt = jobsDb.prepare("SELECT * FROM jobs WHERE uid = ? AND job_id = ?");
const deleteJobStmt = jobsDb.prepare("DELETE FROM jobs WHERE uid = ? AND job_id = ?");
const deleteAllJobsForUserStmt = jobsDb.prepare("DELETE FROM jobs WHERE uid = ?");
const listJobsStmt = jobsDb.prepare("SELECT * FROM jobs WHERE uid = ? ORDER BY created_at DESC LIMIT ?");

// Recorded for every render, previews included — ownsJob() below needs a
// record to exist for a legitimate preview download to pass its ownership
// check. listJobs() filters preview:true back out so "My Masters" still
// only shows real renders, same as before.
//
// The analysis/processing fields (added alongside the original metadata
// set) exist so the dedicated result view (MasterResultView.jsx, reached
// at /app?job=:jobId) can be fully rebuilt from a GET by job_id — on first
// load right after rendering, or on a page refresh, or when revisiting an
// older still-valid master from My Masters. Before this, that page only
// ever read the just-finished render out of in-memory Zustand state, which
// a refresh wiped.
export async function recordJob(uid, job) {
  if (!uid || !job?.job_id) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_HOURS * 3600 * 1000);
  upsertStmt.run({
    uid,
    job_id: job.job_id,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    genre: job.genre || null,
    style: job.style || null,
    tier: job.tier || null,
    output_format: job.output_format || "wav",
    original_filename: job.original_filename || null,
    before_lufs: job.before_lufs ?? null,
    after_lufs: job.after_lufs ?? null,
    preview: job.preview ? 1 : 0,
    analysis_before: toJson(job.analysis_before || null),
    analysis_after: toJson(job.analysis_after || null),
    ab_gain_match: toJson(job.ab_gain_match || null),
    processing_applied: toJson(job.processing_applied || null),
    target_profile_used: toJson(job.target_profile_used || null),
    source_warnings: toJson(job.source_warnings || []),
    quality_control: toJson(job.quality_control || null),
  });
}

// Ownership check for the download/:jobId, download-codec-preview/:jobId,
// and original/:jobId routes — without this, any signed-in user could
// download any OTHER user's mastered file, original upload, or preview
// just by knowing/guessing a job_id. job_id lookups are always scoped to
// the requesting uid's own rows, so a job that isn't there for this uid
// returns false regardless of whether it exists for someone else.
export async function ownsJob(uid, jobId) {
  if (!uid || !jobId) return false;
  return Boolean(getJobStmt.get(uid, jobId));
}

// Used by the share-link mint route and by GET /jobs/:jobId — same
// ownership scoping as ownsJob() either way, just returning the job
// instead of a boolean. created_at/expires_at are already ISO strings
// here (no Firestore Timestamp .toDate() needed anymore), and callers that
// still check `?.toDate` for the old Firestore shape fall through cleanly
// to treating these as plain strings.
export async function getJob(uid, jobId) {
  if (!uid || !jobId) return null;
  return rowToJob(getJobStmt.get(uid, jobId));
}

export async function getJobDetail(uid, jobId) {
  return getJob(uid, jobId);
}

export async function deleteJob(uid, jobId) {
  if (!uid || !jobId) return false;
  const result = deleteJobStmt.run(uid, jobId);
  return result.changes > 0;
}

// Called by profileService.js's deleteAllUserData (DELETE /account) — job
// history no longer lives in the Firestore subcollection that used to
// cascade-delete alongside the rest of a user's data, so that deletion
// flow needs an explicit SQLite-side equivalent or it'd silently leave a
// deleted account's job history behind.
export async function deleteAllJobsForUser(uid) {
  if (!uid) return 0;
  return deleteAllJobsForUserStmt.run(uid).changes;
}

export async function listJobs(uid, limit = 25) {
  if (!uid) return [];
  return listJobsStmt
    .all(uid, limit * 2)
    .map(rowToJob)
    .filter((data) => !data.preview)
    .slice(0, limit);
}
