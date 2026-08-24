import fs from "node:fs";

import { BetaAnalyticsDataClient } from "@google-analytics/data";

import { settings } from "../config/settings.js";

// Read-only traffic numbers for the Telegram bot's /pageviews and /stats
// commands — separate credential from Firebase Admin on purpose. A GA4
// property grants access to specific service accounts individually
// (Admin > Property Access Management); the Firebase project's own
// default service account isn't automatically one of them, so this can't
// just reuse config/firebase.js's loader even though the shape is
// identical.
function loadCredentials() {
  const inlineJson = settings.ga4ServiceAccountJson;
  if (inlineJson) {
    return { credentials: JSON.parse(inlineJson) };
  }

  const path = settings.ga4ServiceAccountPath;
  if (path) {
    if (!fs.existsSync(path)) {
      throw new Error(`GA4_SERVICE_ACCOUNT_PATH is set to '${path}' but that file doesn't exist.`);
    }
    return { keyFilename: path };
  }

  throw new Error(
    "GA4 reporting needs credentials — set GA4_SERVICE_ACCOUNT_PATH (path to a service account JSON with Viewer " +
      "access on the GA4 property) or GA4_SERVICE_ACCOUNT_JSON (the same file's content, inline)."
  );
}

let _client = null;
function client() {
  if (!settings.ga4PropertyId) {
    throw new Error("GA4 reporting isn't configured — set GA4_PROPERTY_ID (GA4 Admin > Property Settings).");
  }
  if (!_client) {
    _client = new BetaAnalyticsDataClient(loadCredentials());
  }
  return _client;
}

function propertyPath() {
  return `properties/${settings.ga4PropertyId}`;
}

// startDate accepts anything the GA4 Data API understands as a relative
// date ("today", "yesterday", "7daysAgo", "30daysAgo") or an explicit
// YYYY-MM-DD.
export async function getTrafficSummary(startDate = "7daysAgo") {
  const [response] = await client().runReport({
    property: propertyPath(),
    dateRanges: [{ startDate, endDate: "today" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "activeUsers" }, { name: "newUsers" }],
  });

  const row = response.rows?.[0];
  const values = row?.metricValues?.map((v) => Number(v.value)) || [0, 0, 0, 0];
  const [pageViews, sessions, activeUsers, newUsers] = values;
  return { startDate, pageViews, sessions, activeUsers, newUsers };
}

export async function getTopPages(startDate = "7daysAgo", limit = 5) {
  const [response] = await client().runReport({
    property: propertyPath(),
    dateRanges: [{ startDate, endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });

  return (response.rows || []).map((r) => ({
    path: r.dimensionValues?.[0]?.value || "(unknown)",
    pageViews: Number(r.metricValues?.[0]?.value || 0),
  }));
}
