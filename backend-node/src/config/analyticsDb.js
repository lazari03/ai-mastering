import path from "node:path";
import fs from "node:fs";

import Database from "better-sqlite3";

// Analytics moved off Firestore entirely (see analyticsService.js's
// ingestBatch history) because it was, by a wide margin, the highest-
// volume write path in this app — a Firestore write on essentially every
// heartbeat/page-view/event, for every visitor, all day — and that's
// exactly what exhausted Firestore's Spark-plan free daily write quota
// (20K writes/day), blocking the admin dashboard and, once it also ate
// into read/auth-check quota, briefly blocking real sign-ins too.
//
// SQLite on this same VPS has no such quota: it's local disk I/O the app
// already has, free, and comfortably fast enough for this app's actual
// traffic (see analyticsQueryService.js's own PERFORMANCE note — this was
// already "read the matching docs and reduce in memory," not a real
// warehouse, so swapping the store underneath doesn't change that shape).
// Firestore remains the store for everything else this app persists
// (users, jobs, presets, billing, admin notifications) — this migration
// is scoped to analytics only, the one thing that was actually causing
// the quota problem.
const DB_PATH = process.env.ANALYTICS_DB_PATH || path.join(process.cwd(), "data", "analytics.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
// WAL = readers don't block the writer and vice versa — this process both
// ingests (writes) and serves the admin dashboard (reads) concurrently.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_visitors (
    visitor_id TEXT PRIMARY KEY,
    uid TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    first_landing_page TEXT,
    first_referrer TEXT,
    first_referrer_domain TEXT,
    first_utm_source TEXT,
    first_utm_medium TEXT,
    first_utm_campaign TEXT,
    first_utm_content TEXT,
    first_utm_term TEXT,
    session_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    uid TEXT,
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ended_at TEXT,
    landing_page TEXT,
    exit_page TEXT,
    referrer TEXT,
    referrer_domain TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    device_category TEXT,
    browser TEXT,
    os TEXT,
    country TEXT,
    authenticated INTEGER NOT NULL DEFAULT 0,
    is_new_visitor INTEGER NOT NULL DEFAULT 0,
    page_view_count INTEGER NOT NULL DEFAULT 0,
    active_ms INTEGER NOT NULL DEFAULT 0,
    has_uploaded INTEGER NOT NULL DEFAULT 0,
    has_analyzed INTEGER NOT NULL DEFAULT 0,
    has_mastered INTEGER NOT NULL DEFAULT 0,
    has_viewed_pricing INTEGER NOT NULL DEFAULT 0,
    has_started_checkout INTEGER NOT NULL DEFAULT 0,
    has_paid INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON analytics_sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON analytics_sessions(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_visitor_id ON analytics_sessions(visitor_id);

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    visitor_id TEXT,
    uid TEXT,
    name TEXT NOT NULL,
    ts TEXT NOT NULL,
    path TEXT,
    props_json TEXT,
    active_ms INTEGER,
    source TEXT NOT NULL DEFAULT 'frontend'
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON analytics_events(ts);
  CREATE INDEX IF NOT EXISTS idx_events_session_id ON analytics_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_name_ts ON analytics_events(name, ts);
`);

export default db;
