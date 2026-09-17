import path from "node:path";
import fs from "node:fs";

import Database from "better-sqlite3";

// Mastering job history, moved off Firestore for the same reason analytics
// was (see analyticsDb.js): every render (previews included — see
// jobsService.js's recordJob comment) is a write, and this app's founder
// wants real headroom under Firestore's Spark-plan free daily write quota
// rather than trading one quota-exhaustion incident for a slower-motion
// repeat of it. Firestore remains the store for genuinely low-volume,
// one-write-per-real-action data (users, billing, presets, admin).
//
// Shares the same on-disk directory (and the same `analytics_db` Docker
// volume mount) as analyticsDb.js's analytics.db — a second file in that
// directory, not a second volume, since both just need "survive a
// container recreate" and there's no reason to provision that twice.
const DB_PATH = process.env.JOBS_DB_PATH || path.join(process.cwd(), "data", "jobs.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    uid TEXT NOT NULL,
    job_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    genre TEXT,
    style TEXT,
    tier TEXT,
    output_format TEXT,
    original_filename TEXT,
    before_lufs REAL,
    after_lufs REAL,
    preview INTEGER NOT NULL DEFAULT 0,
    analysis_before TEXT,
    analysis_after TEXT,
    ab_gain_match TEXT,
    processing_applied TEXT,
    target_profile_used TEXT,
    source_warnings TEXT,
    quality_control TEXT,
    PRIMARY KEY (uid, job_id)
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_uid_created_at ON jobs(uid, created_at DESC);
`);

export default db;
