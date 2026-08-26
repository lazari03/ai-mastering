import { getFirestore } from "../config/firebase.js";

// Mastering job history — users/{uid}/jobs/{jobId} — recorded after a
// /master render completes so a user can revisit "what did I upload and
// what came back" later (the "My Masters" tab), even after a page reload
// wipes the in-memory result. This tracks metadata only, never audio —
// the actual files still expire on their normal 48h retention window (see
// backend/app/core/storage_cleanup.py); a job entry outliving its files
// just means the download links go stale, which the frontend surfaces via
// expires_at rather than something this service needs to prevent.
const RETENTION_HOURS = 48;

function jobsCollection(uid) {
  return getFirestore().collection("users").doc(uid).collection("jobs");
}

// Recorded for every render, previews included — ownsJob() below needs a
// record to exist for a legitimate preview download to pass its
// ownership check. listJobs() filters preview:true back out so "My
// Masters" still only shows real renders, same as before.
//
// The analysis/processing fields (added alongside the original metadata
// set) exist so the dedicated result page (MasterResultView.jsx, reached
// at /app/masters/:jobId) can be fully rebuilt from a GET by job_id — on
// first load right after rendering, or on a page refresh, or when
// revisiting an older still-valid master from My Masters. Before this,
// that page only ever read the just-finished render out of in-memory
// Zustand state, which a refresh wiped. A few KB of JSON per job, nowhere
// close to Firestore's 1MiB document limit.
export async function recordJob(uid, job) {
  if (!uid || !job?.job_id) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_HOURS * 3600 * 1000);
  await jobsCollection(uid).doc(job.job_id).set({
    job_id: job.job_id,
    created_at: now,
    expires_at: expiresAt,
    genre: job.genre || null,
    style: job.style || null,
    tier: job.tier || null,
    output_format: job.output_format || "wav",
    original_filename: job.original_filename || null,
    before_lufs: job.before_lufs ?? null,
    after_lufs: job.after_lufs ?? null,
    preview: Boolean(job.preview),
    analysis_before: job.analysis_before || null,
    analysis_after: job.analysis_after || null,
    ab_gain_match: job.ab_gain_match || null,
    processing_applied: job.processing_applied || null,
    target_profile_used: job.target_profile_used || null,
    source_warnings: job.source_warnings || [],
    quality_control: job.quality_control || null,
  });
}

// Ownership check for the download/:jobId, download-codec-preview/:jobId,
// and original/:jobId routes — without this, any signed-in user could
// download any OTHER user's mastered file, original upload, or preview
// just by knowing/guessing a job_id. job_id lookups are always scoped to
// the requesting uid's own subcollection, so a job that isn't there for
// this uid returns false regardless of whether it exists for someone else.
export async function ownsJob(uid, jobId) {
  if (!uid || !jobId) return false;
  const doc = await jobsCollection(uid).doc(jobId).get();
  return doc.exists;
}

// Used by the share-link mint route (raw Firestore Timestamps are fine
// there, nothing serializes them to JSON) and by GET /jobs/:jobId (which
// does need created_at/expires_at as ISO strings, same conversion
// listJobs() already does for the list view) — same ownership scoping as
// ownsJob() either way, just returning the doc instead of a boolean.
export async function getJob(uid, jobId) {
  if (!uid || !jobId) return null;
  const doc = await jobsCollection(uid).doc(jobId).get();
  return doc.exists ? doc.data() : null;
}

export async function getJobDetail(uid, jobId) {
  const data = await getJob(uid, jobId);
  if (!data) return null;
  return {
    ...data,
    created_at: data.created_at?.toDate?.().toISOString() || null,
    expires_at: data.expires_at?.toDate?.().toISOString() || null,
  };
}

export async function deleteJob(uid, jobId) {
  if (!uid || !jobId) return false;
  const ref = jobsCollection(uid).doc(jobId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

export async function listJobs(uid, limit = 25) {
  if (!uid) return [];
  const snapshot = await jobsCollection(uid).orderBy("created_at", "desc").limit(limit * 2).get();
  return snapshot.docs
    .map((doc) => doc.data())
    .filter((data) => !data.preview)
    .slice(0, limit)
    .map((data) => ({
      ...data,
      created_at: data.created_at?.toDate?.().toISOString() || null,
      expires_at: data.expires_at?.toDate?.().toISOString() || null,
    }));
}
