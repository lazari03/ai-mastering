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
  });
}

export async function listJobs(uid, limit = 25) {
  if (!uid) return [];
  const snapshot = await jobsCollection(uid).orderBy("created_at", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      created_at: data.created_at?.toDate?.().toISOString() || null,
      expires_at: data.expires_at?.toDate?.().toISOString() || null,
    };
  });
}
