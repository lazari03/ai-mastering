// One-off migration: copy every analyticsVisitors/analyticsSessions/
// analyticsEvents doc still sitting in Firestore (written before the
// SQLite cutover — see analyticsService.js's git history / commit "Move
// analytics storage off Firestore to local SQLite") into the local SQLite
// file at ANALYTICS_DB_PATH, using the exact same schema analyticsDb.js
// already creates on boot.
//
// Run inside the node-api container so it shares the real Firestore
// credentials and the same SQLite volume the app itself uses:
//   docker compose exec -T node-api node scripts/migrateAnalyticsFromFirestore.js
//
// Safe to re-run: every insert is "INSERT OR IGNORE" keyed by the same
// primary key Firestore already assigned (visitorId/sessionId), and events
// are deduped on (session_id, name, ts, path) since Firestore auto-IDs
// don't carry over to SQLite's autoincrement id. Never touches anything
// ingested after the cutover — this only backfills history.
import { getFirestore } from "../src/config/firebase.js";
import analyticsDb from "../src/config/analyticsDb.js";

const BATCH_SIZE = 500;

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function bool(value) {
  return value ? 1 : 0;
}

async function migrateVisitors(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO analytics_visitors (
      visitor_id, uid, first_seen_at, last_seen_at, first_landing_page,
      first_referrer, first_referrer_domain, first_utm_source, first_utm_medium,
      first_utm_campaign, first_utm_content, first_utm_term, session_count
    ) VALUES (@visitor_id, @uid, @first_seen_at, @last_seen_at, @first_landing_page,
      @first_referrer, @first_referrer_domain, @first_utm_source, @first_utm_medium,
      @first_utm_campaign, @first_utm_content, @first_utm_term, @session_count)
  `);

  let lastDoc = null;
  let count = 0;
  for (;;) {
    let query = getFirestore().collection("analyticsVisitors").orderBy("__name__").limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    const insertMany = db.transaction((docs) => {
      for (const doc of docs) {
        const d = doc.data();
        const firstSeenAt = toIso(d.firstSeenAt) || new Date(0).toISOString();
        insert.run({
          visitor_id: doc.id,
          uid: d.uid || null,
          first_seen_at: firstSeenAt,
          last_seen_at: toIso(d.lastSeenAt) || firstSeenAt,
          first_landing_page: d.firstLandingPage || null,
          first_referrer: d.firstReferrer || null,
          first_referrer_domain: d.firstReferrerDomain || null,
          first_utm_source: d.firstUtmSource || null,
          first_utm_medium: d.firstUtmMedium || null,
          first_utm_campaign: d.firstUtmCampaign || null,
          first_utm_content: d.firstUtmContent || null,
          first_utm_term: d.firstUtmTerm || null,
          session_count: d.sessionCount || 0,
        });
      }
    });
    insertMany(snap.docs);

    count += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE) break;
  }
  return count;
}

async function migrateSessions(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO analytics_sessions (
      session_id, visitor_id, uid, started_at, last_seen_at, ended_at,
      landing_page, exit_page, referrer, referrer_domain,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      device_category, browser, os, country, authenticated, is_new_visitor,
      page_view_count, active_ms, has_uploaded, has_analyzed, has_mastered,
      has_viewed_pricing, has_started_checkout, has_paid
    ) VALUES (@session_id, @visitor_id, @uid, @started_at, @last_seen_at, @ended_at,
      @landing_page, @exit_page, @referrer, @referrer_domain,
      @utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term,
      @device_category, @browser, @os, @country, @authenticated, @is_new_visitor,
      @page_view_count, @active_ms, @has_uploaded, @has_analyzed, @has_mastered,
      @has_viewed_pricing, @has_started_checkout, @has_paid)
  `);

  let lastDoc = null;
  let count = 0;
  for (;;) {
    let query = getFirestore().collection("analyticsSessions").orderBy("__name__").limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    const insertMany = db.transaction((docs) => {
      for (const doc of docs) {
        const d = doc.data();
        const startedAt = toIso(d.startedAt) || new Date(0).toISOString();
        insert.run({
          session_id: doc.id,
          visitor_id: d.visitorId,
          uid: d.uid || null,
          started_at: startedAt,
          last_seen_at: toIso(d.lastSeenAt) || startedAt,
          ended_at: toIso(d.endedAt),
          landing_page: d.landingPage || null,
          exit_page: d.exitPage || null,
          referrer: d.referrer || null,
          referrer_domain: d.referrerDomain || null,
          utm_source: d.utmSource || null,
          utm_medium: d.utmMedium || null,
          utm_campaign: d.utmCampaign || null,
          utm_content: d.utmContent || null,
          utm_term: d.utmTerm || null,
          device_category: d.deviceCategory || null,
          browser: d.browser || null,
          os: d.os || null,
          country: d.country || null,
          authenticated: bool(d.authenticated),
          is_new_visitor: bool(d.isNewVisitor),
          page_view_count: d.pageViewCount || 0,
          active_ms: d.activeMs || 0,
          has_uploaded: bool(d.hasUploaded),
          has_analyzed: bool(d.hasAnalyzed),
          has_mastered: bool(d.hasMastered),
          has_viewed_pricing: bool(d.hasViewedPricing),
          has_started_checkout: bool(d.hasStartedCheckout),
          has_paid: bool(d.hasPaid),
        });
      }
    });
    insertMany(snap.docs);

    count += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE) break;
  }
  return count;
}

async function migrateEvents(db) {
  // Firestore auto-IDs don't map to SQLite's autoincrement id, so dedup on
  // content instead — this uniqueness is only ever needed for this one
  // migration script, not general ingestion, so it lives here rather than
  // as a schema-wide constraint.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_migration_dedup
    ON analytics_events(session_id, name, ts, IFNULL(path, ''))
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      session_id, visitor_id, uid, name, ts, path, props_json, active_ms, source
    ) VALUES (@session_id, @visitor_id, @uid, @name, @ts, @path, @props_json, @active_ms, @source)
  `);

  let lastDoc = null;
  let count = 0;
  for (;;) {
    let query = getFirestore().collection("analyticsEvents").orderBy("__name__").limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    const insertMany = db.transaction((docs) => {
      for (const doc of docs) {
        const d = doc.data();
        insert.run({
          session_id: d.sessionId || null,
          visitor_id: d.visitorId || null,
          uid: d.uid || null,
          name: d.name,
          ts: toIso(d.ts) || new Date(0).toISOString(),
          path: d.path || null,
          props_json: d.props && Object.keys(d.props).length ? JSON.stringify(d.props) : null,
          active_ms: typeof d.activeMs === "number" ? d.activeMs : null,
          source: d.source || "frontend",
        });
      }
    });
    insertMany(snap.docs);

    count += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE) break;
  }
  return count;
}

async function main() {
  console.log("Migrating analyticsVisitors...");
  const visitors = await migrateVisitors(analyticsDb);
  console.log(`  scanned ${visitors} visitor docs`);

  console.log("Migrating analyticsSessions...");
  const sessions = await migrateSessions(analyticsDb);
  console.log(`  scanned ${sessions} session docs`);

  console.log("Migrating analyticsEvents...");
  const events = await migrateEvents(analyticsDb);
  console.log(`  scanned ${events} event docs`);

  console.log("Done. Row counts now in SQLite:");
  for (const table of ["analytics_visitors", "analytics_sessions", "analytics_events"]) {
    const { c } = analyticsDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
    console.log(`  ${table}: ${c}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
