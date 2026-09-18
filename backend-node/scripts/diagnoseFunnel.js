// One-off, read-only: real signup-funnel numbers straight from the SQLite
// analytics store, to answer "why aren't visitors registering" with data
// instead of a guess. Prints visitor/session counts and key funnel events
// over the last 30 days.
import analyticsDb from "../src/config/analyticsDb.js";

const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

function count(sql, ...params) {
  return analyticsDb.prepare(sql).get(...params).c;
}

const totalSessions = count("SELECT COUNT(*) AS c FROM analytics_sessions WHERE started_at >= ?", since);
const authenticatedSessions = count("SELECT COUNT(*) AS c FROM analytics_sessions WHERE started_at >= ? AND authenticated = 1", since);
const newVisitors = count("SELECT COUNT(*) AS c FROM analytics_visitors WHERE first_seen_at >= ?", since);

const eventCounts = analyticsDb
  .prepare(
    `SELECT name, COUNT(*) AS c FROM analytics_events
     WHERE ts >= ? AND name IN ('signup_started','sign_up','login','login_completed','audio_upload_completed','pricing_view','pricing_viewed','checkout_started','payment_succeeded')
     GROUP BY name`
  )
  .all(since);

console.log(`Window: last 30 days (since ${since})`);
console.log(`Total sessions: ${totalSessions}`);
console.log(`Authenticated sessions: ${authenticatedSessions}`);
console.log(`New visitors: ${newVisitors}`);
console.log("Key funnel events:");
for (const row of eventCounts) console.log(`  ${row.name}: ${row.c}`);

process.exit(0);
