// One-off, read-only: the user asked whether recent site traffic looks
// real or bot-driven. analyticsService.js's own ingestion path has no bot
// filtering at all (confirmed by reading it — no user-agent allowlist, no
// known-crawler denylist, no IP stored to dedupe on), so the only way to
// answer this is to actually look at what's in the DB. Deleted once the
// question is answered — see this session's established one-off pattern.
import analyticsDb from "../src/config/analyticsDb.js";

const sinceIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

console.log("=== Sessions by browser/os/device (last 30 days) ===");
for (const row of analyticsDb
  .prepare(
    `SELECT browser, os, device_category, COUNT(*) as n
     FROM analytics_sessions WHERE started_at >= ?
     GROUP BY browser, os, device_category ORDER BY n DESC`
  )
  .all(sinceIso)) {
  console.log(row);
}

console.log("\n=== Top referrer domains (last 30 days) ===");
for (const row of analyticsDb
  .prepare(
    `SELECT COALESCE(referrer_domain, '(none/direct)') as domain, COUNT(*) as n
     FROM analytics_sessions WHERE started_at >= ?
     GROUP BY domain ORDER BY n DESC LIMIT 20`
  )
  .all(sinceIso)) {
  console.log(row);
}

console.log("\n=== Top landing pages (last 30 days) ===");
for (const row of analyticsDb
  .prepare(
    `SELECT landing_page, COUNT(*) as n
     FROM analytics_sessions WHERE started_at >= ?
     GROUP BY landing_page ORDER BY n DESC LIMIT 20`
  )
  .all(sinceIso)) {
  console.log(row);
}

console.log("\n=== Sessions per calendar day (last 30 days) — spikes/bursts ===");
for (const row of analyticsDb
  .prepare(
    `SELECT substr(started_at, 1, 10) as day, COUNT(*) as n
     FROM analytics_sessions WHERE started_at >= ?
     GROUP BY day ORDER BY day ASC`
  )
  .all(sinceIso)) {
  console.log(row);
}

console.log("\n=== Sessions with zero engagement (no events beyond the landing pageview) ===");
const zeroEngagement = analyticsDb
  .prepare(
    `SELECT s.session_id, s.started_at, s.landing_page, s.referrer_domain, s.browser, s.os,
            (SELECT COUNT(*) FROM analytics_events e WHERE e.session_id = s.session_id) as event_count
     FROM analytics_sessions s WHERE s.started_at >= ?`
  )
  .all(sinceIso);
const zeroCount = zeroEngagement.filter((r) => r.event_count <= 1).length;
console.log(`${zeroCount} / ${zeroEngagement.length} sessions had <=1 recorded event (just the initial pageview, nothing else)`);

console.log("\n=== Sample of the 15 most recent sessions (raw) ===");
for (const row of analyticsDb
  .prepare(
    `SELECT session_id, started_at, landing_page, referrer, referrer_domain, utm_source, browser, os, device_category
     FROM analytics_sessions ORDER BY started_at DESC LIMIT 15`
  )
  .all()) {
  console.log(row);
}
