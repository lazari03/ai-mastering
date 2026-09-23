import { getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";
import analyticsDb from "../config/analyticsDb.js";
import { CHECKOUT_ABANDON_MS } from "./analyticsService.js";

// ---------------------------------------------------------------------
// Admin read/aggregation layer. Deliberately NOT a data warehouse (spec
// section 29/30): every function here reads the matching SQLite rows for
// the requested date range and reduces them in memory. That's the right
// amount of infrastructure for this app's actual traffic — if volume
// ever makes that slow, the fix is a scheduled rollup job writing daily
// summary rows, not swapping the whole storage model, and nothing below
// is structured in a way that would block adding that later.
//
// Rows come back from better-sqlite3 as plain JS objects with snake_case
// columns and 0/1 integers for booleans — the row mappers below
// (sessionFromRow/eventFromRow) are the one place that translates those
// into the camelCase/boolean/ISO-string shape every function here (and
// the frontend) already expects, so the business logic below reads
// exactly like it did against Firestore.
// ---------------------------------------------------------------------

function db() {
  return analyticsDb;
}

function sessionFromRow(row) {
  if (!row) return null;
  return {
    id: row.session_id,
    sessionId: row.session_id,
    visitorId: row.visitor_id,
    uid: row.uid,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    endedAt: row.ended_at,
    landingPage: row.landing_page,
    exitPage: row.exit_page,
    referrer: row.referrer,
    referrerDomain: row.referrer_domain,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    deviceCategory: row.device_category,
    browser: row.browser,
    os: row.os,
    country: row.country,
    authenticated: Boolean(row.authenticated),
    isNewVisitor: Boolean(row.is_new_visitor),
    pageViewCount: row.page_view_count,
    activeMs: row.active_ms,
    hasUploaded: Boolean(row.has_uploaded),
    hasAnalyzed: Boolean(row.has_analyzed),
    hasMastered: Boolean(row.has_mastered),
    hasViewedPricing: Boolean(row.has_viewed_pricing),
    hasStartedCheckout: Boolean(row.has_started_checkout),
    hasPaid: Boolean(row.has_paid),
  };
}

function eventFromRow(row) {
  if (!row) return null;
  let props = {};
  try {
    props = row.props_json ? JSON.parse(row.props_json) : {};
  } catch {
    props = {};
  }
  return {
    id: String(row.id),
    sessionId: row.session_id,
    visitorId: row.visitor_id,
    uid: row.uid,
    name: row.name,
    ts: row.ts,
    path: row.path,
    props,
    activeMs: row.active_ms,
    source: row.source,
  };
}

// A "unique visitor" count is only as good as the identifier it's keyed
// on. visitorId is a browser-local localStorage value — real, but it
// resets the moment someone clears storage, switches browsers, or opens
// a private window, so the same person can legitimately hold several of
// them. Once a session is authenticated we have something better: uid,
// the actual account, stable across every device and browser that person
// ever signs into. Preferring it here is what stops "the same logged-in
// user tested this 10 times from two browsers" from inflating a
// visitor-count metric — it does NOT touch pageViewCount/views (a real
// distinct visit each time still counts as a visit; only the "how many
// distinct people" tally collapses them). Anonymous traffic has no uid
// yet, so it falls back to visitorId exactly as before.
function identityKey(record) {
  return record.uid || record.visitorId;
}

// Organic = arrived via a search engine's own results, not a paid click or
// a direct/social visit — utm_medium=organic (if a page ever sets it
// explicitly) or a referrer domain that's a known search engine with no
// utm params at all (the normal case: someone clicked a real Google
// result). This is intentionally simple pattern matching, not a full
// referrer-classification service — see analyticsQueryService.js's own
// section 25 note: Search Console remains the source of truth for
// queries/impressions/clicks, this only classifies what already reached
// us as organic vs. everything else.
const SEARCH_ENGINE_DOMAINS = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "yandex.", "baidu."];
function isOrganicSession(session) {
  if (session.utmMedium === "organic") return true;
  if (session.utmSource) return false; // any other explicit UTM is a tagged campaign, not organic
  return Boolean(session.referrerDomain) && SEARCH_ENGINE_DOMAINS.some((needle) => session.referrerDomain.includes(needle));
}

function toDate(value, fallback) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
}

// Resolves the named admin date-range shortcuts (spec section 18) plus an
// explicit from/to pair, and derives the equivalent immediately-preceding
// period for the "vs previous period" comparisons the Overview page shows.
export function resolveRange({ preset, from, to }) {
  const now = new Date();
  let rangeTo = toDate(to, now);
  let rangeFrom;
  if (from) {
    rangeFrom = toDate(from, new Date(now.getTime() - 7 * 86400000));
  } else {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    switch (preset) {
      case "today":
        rangeFrom = startOfToday;
        break;
      case "yesterday": {
        rangeFrom = new Date(startOfToday.getTime() - 86400000);
        rangeTo = startOfToday;
        break;
      }
      case "90d":
        rangeFrom = new Date(startOfToday.getTime() - 90 * 86400000);
        break;
      case "30d":
        rangeFrom = new Date(startOfToday.getTime() - 30 * 86400000);
        break;
      case "7d":
      default:
        rangeFrom = new Date(startOfToday.getTime() - 7 * 86400000);
        break;
    }
  }
  const spanMs = rangeTo.getTime() - rangeFrom.getTime();
  const prevTo = new Date(rangeFrom.getTime());
  const prevFrom = new Date(rangeFrom.getTime() - spanMs);
  return { from: rangeFrom, to: rangeTo, prevFrom, prevTo };
}

// ISO 8601 strings sort lexicographically in the same order as
// chronologically, so a plain TEXT >= / < range comparison in SQL is
// exact — no date parsing needed on the SQLite side at all.
function fetchSessionsInRange(from, to) {
  const rows = db().prepare("SELECT * FROM analytics_sessions WHERE started_at >= ? AND started_at < ?").all(from.toISOString(), to.toISOString());
  return rows.map(sessionFromRow);
}

// Name filtering happens in SQL (idx_events_name_ts), not after loading
// every row: heartbeats are the bulk of analytics_events, and the old
// "SELECT * in range, then .filter() in JS" parsed all of them on every
// call — six times per Overview load.
const eventsStmtCache = new Map();
function fetchEventsInRange(from, to, names = null) {
  const range = [from.toISOString(), to.toISOString()];
  if (!names) {
    return db().prepare("SELECT * FROM analytics_events WHERE ts >= ? AND ts < ?").all(...range).map(eventFromRow);
  }
  if (names.length === 0) return [];
  const key = names.length;
  if (!eventsStmtCache.has(key)) {
    const placeholders = names.map(() => "?").join(", ");
    eventsStmtCache.set(key, db().prepare(`SELECT * FROM analytics_events WHERE name IN (${placeholders}) AND ts >= ? AND ts < ?`));
  }
  return eventsStmtCache.get(key).all(...names, ...range).map(eventFromRow);
}

function applySessionFilters(sessions, filters = {}) {
  return sessions.filter((s) => {
    if (filters.source && (s.utmSource || s.referrerDomain || "direct") !== filters.source) return false;
    if (filters.device && s.deviceCategory !== filters.device) return false;
    if (filters.country && s.country !== filters.country) return false;
    if (filters.landingPage && s.landingPage !== filters.landingPage) return false;
    if (filters.newOrReturning === "new" && !s.isNewVisitor) return false;
    if (filters.newOrReturning === "returning" && s.isNewVisitor) return false;
    return true;
  });
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

// PLANS pricing mirrored here for MRR estimation — see frontend/src/lib/
// pricing.js, the single source of truth for what these actually cost.
// Kept as a small constant map (not imported cross-project) since
// backend-node and frontend are separate deploys; if a price changes,
// update both. Monthly-equivalent EUR per product: annual plans count as
// price/12. (Previously only monthly Studio and All-Access were counted,
// so Indie and every annual subscriber were missing from MRR.)
function mrrProducts() {
  const p = settings.polarProducts;
  return [
    [p.planIndie, 4.99],
    [p.planStudio, 9.99],
    [p.planPro, 19.99],
    [p.planIndieAnnual, 49.9 / 12],
    [p.planStudioAnnual, 99.9 / 12],
    [p.planProAnnual, 199.9 / 12],
  ].filter(([productId]) => Boolean(productId));
}

// Subscriptions themselves stay in Firestore (users/{uid}.subscription) —
// that's low-volume, one doc per paying customer, nowhere near the
// analytics write pattern that forced the SQLite move.
async function estimateSubscriptionStats() {
  const products = mrrProducts();
  const counts = await Promise.all(
    products.map(([productId]) =>
      getFirestore().collection("users").where("subscription.status", "==", "active").where("subscription.productId", "==", productId).count().get()
    )
  );
  let activeSubscribers = 0;
  let mrr = 0;
  counts.forEach((snap, i) => {
    const n = snap.data().count;
    activeSubscribers += n;
    mrr += n * products[i][1];
  });
  return { activeSubscribers, mrr: Math.round(mrr * 100) / 100 };
}

export async function getOverview({ from, to, prevFrom, prevTo }) {
  const [subStats] = await Promise.all([estimateSubscriptionStats()]);
  const sessions = fetchSessionsInRange(from, to);
  const prevSessions = fetchSessionsInRange(prevFrom, prevTo);
  const paymentEvents = fetchEventsInRange(from, to, ["payment_succeeded"]);
  const prevPaymentEvents = fetchEventsInRange(prevFrom, prevTo, ["payment_succeeded"]);
  const cancelEvents = fetchEventsInRange(from, to, ["subscription_cancelled"]);
  const shareEvents = fetchEventsInRange(from, to, ["share_created"]);
  const downloadEvents = fetchEventsInRange(from, to, ["download_completed"]);
  const errorEvents = authoritative(fetchEventsInRange(from, to, FAILURE_EVENT_NAMES));
  // Sign-ups come from the server-observed sign_up event (written when an
  // account is actually created), not "authenticated session from a new
  // visitor" — that counted returning users on a fresh browser as sign-ups
  // and missed people who signed up on their second visit.
  const signupCount = fetchEventsInRange(from, to, ["sign_up"]).length;
  const prevSignupCount = fetchEventsInRange(prevFrom, prevTo, ["sign_up"]).length;

  const summarize = (list) => ({
    sessions: list.length,
    visitors: new Set(list.map(identityKey)).size,
    newVisitors: list.filter((s) => s.isNewVisitor).length,
    returningVisitors: list.filter((s) => !s.isNewVisitor).length,
    uploads: list.filter((s) => s.hasUploaded).length,
    masters: list.filter((s) => s.hasMastered).length,
    pricingViews: list.filter((s) => s.hasViewedPricing).length,
    checkoutStarts: list.filter((s) => s.hasStartedCheckout).length,
    paid: list.filter((s) => s.hasPaid).length,
    signups: list.filter((s) => s.authenticated && s.isNewVisitor).length,
    avgActiveSeconds: list.length ? Math.round(list.reduce((sum, s) => sum + (s.activeMs || 0), 0) / list.length / 1000) : 0,
  });

  const current = summarize(sessions);
  const previous = summarize(prevSessions);
  const revenue = paymentEvents.reduce((sum, e) => sum + (e.props?.amountCents || 0), 0) / 100;
  const prevRevenue = prevPaymentEvents.reduce((sum, e) => sum + (e.props?.amountCents || 0), 0) / 100;

  const withDelta = (curr, prev) => ({ value: curr, previous: prev, deltaPct: prev ? Math.round(((curr - prev) / prev) * 1000) / 10 : null });

  return {
    range: { from, to, prevFrom, prevTo },
    visitors: withDelta(current.visitors, previous.visitors),
    newVisitors: withDelta(current.newVisitors, previous.newVisitors),
    returningVisitors: withDelta(current.returningVisitors, previous.returningVisitors),
    signups: withDelta(signupCount, prevSignupCount),
    avgSessionSeconds: withDelta(current.avgActiveSeconds, previous.avgActiveSeconds),
    uploads: withDelta(current.uploads, previous.uploads),
    masters: withDelta(current.masters, previous.masters),
    pricingViews: withDelta(current.pricingViews, previous.pricingViews),
    checkoutStarts: withDelta(current.checkoutStarts, previous.checkoutStarts),
    newCustomers: withDelta(current.paid, previous.paid),
    revenue: withDelta(revenue, prevRevenue),
    mrr: subStats.mrr,
    activeSubscribers: subStats.activeSubscribers,
    cancellations: cancelEvents.length,
    sharesCreated: shareEvents.length,
    downloadsCompleted: downloadEvents.length,
    errorCount: errorEvents.length,
    // Session-based on both sides: the upload/master/paid counts are
    // sessions, so dividing them by unique visitors mixed units and could
    // exceed 100% (one visitor, three sessions, three uploads).
    conversion: {
      visitorToUpload: pct(current.uploads, current.sessions),
      visitorToMaster: pct(current.masters, current.sessions),
      visitorToPaid: withDelta(pct(current.paid, current.sessions), pct(previous.paid, previous.sessions)),
      checkoutToPaid: pct(current.paid, current.checkoutStarts),
    },
  };
}

// One day-bucketed series for the Overview page's trend chart — visitors,
// masters, and revenue per calendar day across the requested range. Kept
// separate from getOverview() (which returns single totals) rather than
// folding buckets into it, so a caller that only needs the headline
// numbers isn't forced to pay for (or receive) a day-by-day breakdown too.
export async function getOverviewTimeseries({ from, to }) {
  const sessions = fetchSessionsInRange(from, to);
  const paymentEvents = fetchEventsInRange(from, to, ["payment_succeeded"]);

  const dayKey = (date) => date.toISOString().slice(0, 10);
  const buckets = new Map();
  for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
    buckets.set(dayKey(d), { date: dayKey(d), visitorIds: new Set(), masters: 0, revenueCents: 0 });
  }
  // A range under a day still gets one bucket to plot (dayKey(from) itself),
  // rather than an empty chart.
  if (buckets.size === 0) buckets.set(dayKey(from), { date: dayKey(from), visitorIds: new Set(), masters: 0, revenueCents: 0 });

  const bucketFor = (date) => buckets.get(dayKey(date)) || [...buckets.values()][buckets.size - 1];

  for (const s of sessions) {
    const started = s.startedAt ? new Date(s.startedAt) : null;
    if (!started) continue;
    const bucket = bucketFor(started);
    if (!bucket) continue;
    bucket.visitorIds.add(identityKey(s));
    if (s.hasMastered) bucket.masters++;
  }
  for (const e of paymentEvents) {
    const ts = e.ts ? new Date(e.ts) : null;
    if (!ts) continue;
    const bucket = bucketFor(ts);
    if (!bucket) continue;
    bucket.revenueCents += e.props?.amountCents || 0;
  }

  return [...buckets.values()].map((b) => ({
    date: b.date,
    visitors: b.visitorIds.size,
    masters: b.masters,
    revenue: Math.round(b.revenueCents) / 100,
  }));
}

export async function getFunnel({ from, to, filters }) {
  const sessions = applySessionFilters(fetchSessionsInRange(from, to), filters);
  const visitors = sessions.length;
  const uploaded = sessions.filter((s) => s.hasUploaded).length;
  const mastered = sessions.filter((s) => s.hasMastered).length;
  const pricing = sessions.filter((s) => s.hasViewedPricing).length;
  const checkout = sessions.filter((s) => s.hasStartedCheckout).length;
  const paid = sessions.filter((s) => s.hasPaid).length;

  const steps = [
    { key: "visitors", label: "Visitors", count: visitors },
    { key: "upload", label: "Audio Uploaded", count: uploaded },
    { key: "master", label: "Master Completed", count: mastered },
    { key: "pricing", label: "Pricing Viewed", count: pricing },
    { key: "checkout", label: "Checkout Started", count: checkout },
    { key: "paid", label: "Paid", count: paid },
  ];
  return steps.map((step, i) => ({
    ...step,
    conversionFromPrevious: i === 0 ? 100 : pct(step.count, steps[i - 1].count),
    conversionFromVisitors: pct(step.count, visitors),
  }));
}

function sourceKeyFor(session) {
  if (session.utmSource) return session.utmSource;
  if (!session.referrerDomain) return "direct";
  return session.referrerDomain;
}

export async function getAcquisition({ from, to }) {
  const sessions = fetchSessionsInRange(from, to);
  const paymentEvents = fetchEventsInRange(from, to, ["payment_succeeded"]);
  const revenueByUid = new Map();
  for (const e of paymentEvents) {
    if (!e.uid) continue;
    revenueByUid.set(e.uid, (revenueByUid.get(e.uid) || 0) + (e.props?.amountCents || 0));
  }
  const groups = new Map();
  for (const s of sessions) {
    const key = sourceKeyFor(s);
    if (!groups.has(key)) groups.set(key, { source: key, visitors: new Set(), newVisitors: 0, uploads: 0, masters: 0, checkouts: 0, customers: 0, revenueCents: 0, uids: new Set() });
    const g = groups.get(key);
    g.visitors.add(identityKey(s));
    if (s.isNewVisitor) g.newVisitors++;
    if (s.hasUploaded) g.uploads++;
    if (s.hasMastered) g.masters++;
    if (s.hasStartedCheckout) g.checkouts++;
    if (s.hasPaid) {
      g.customers++;
      if (s.uid) g.uids.add(s.uid);
    }
  }
  return [...groups.values()]
    .map((g) => {
      const revenueCents = [...g.uids].reduce((sum, uid) => sum + (revenueByUid.get(uid) || 0), 0);
      return {
        source: g.source,
        visitors: g.visitors.size,
        newVisitors: g.newVisitors,
        uploads: g.uploads,
        masters: g.masters,
        checkouts: g.checkouts,
        customers: g.customers,
        revenue: Math.round(revenueCents) / 100,
        conversion: pct(g.customers, g.visitors.size),
      };
    })
    .sort((a, b) => b.visitors - a.visitors);
}

// Per-page report (spec section 22) — driven primarily by real page_view
// events (views, unique visitors, true average active time from each
// event's own stored activeMs — see analyticsService.js's ingestBatch),
// with entrances/exits/downstream-funnel counts joined in from sessions
// (landingPage/exitPage/hasUploaded etc. are session-level facts, not
// per-page ones). Doubles as the SEO landing-page report (spec section
// 12) when the caller filters the result to entrance-heavy rows itself.
export async function getPages({ from, to }) {
  // page_view drives view/unique-visitor counts; heartbeat (a lightweight
  // ~10s ping the frontend only sends while a tab is actually visible and
  // the visitor has interacted recently — see analyticsClient.js) is what
  // actually carries real per-path active time, not page_view itself —
  // a page_view fires once, at the moment of arrival, before any time has
  // passed on it at all.
  const pageViewEvents = fetchEventsInRange(from, to, ["page_view"]);
  const heartbeatEvents = fetchEventsInRange(from, to, ["heartbeat"]);
  const sessions = fetchSessionsInRange(from, to);

  const groups = new Map();
  const ensure = (path) => {
    if (!groups.has(path)) groups.set(path, { path, visitors: new Set(), views: 0, activeMsTotal: 0, activeSamples: 0, entrances: 0, exits: 0, uploads: 0, masters: 0, pricingViews: 0, checkouts: 0, paid: 0 });
    return groups.get(path);
  };

  for (const e of pageViewEvents) {
    const g = ensure(e.path || "/");
    g.views++;
    if (e.visitorId) g.visitors.add(identityKey(e));
  }
  for (const e of heartbeatEvents) {
    if (typeof e.activeMs !== "number" || !e.path) continue;
    const g = ensure(e.path);
    g.activeMsTotal += e.activeMs;
    g.activeSamples++;
    if (e.visitorId) g.visitors.add(identityKey(e));
  }
  for (const s of sessions) {
    if (s.landingPage) {
      const g = ensure(s.landingPage);
      g.entrances++;
      if (s.hasUploaded) g.uploads++;
      if (s.hasMastered) g.masters++;
      if (s.hasViewedPricing) g.pricingViews++;
      if (s.hasStartedCheckout) g.checkouts++;
      if (s.hasPaid) g.paid++;
    }
    if (s.exitPage) ensure(s.exitPage).exits++;
  }

  return [...groups.values()]
    .map((g) => ({
      path: g.path,
      views: g.views,
      uniqueVisitors: g.visitors.size,
      entrances: g.entrances,
      exits: g.exits,
      avgActiveSeconds: g.visitors.size ? Math.round(g.activeMsTotal / g.visitors.size / 1000) : 0,
      uploads: g.uploads,
      masters: g.masters,
      pricingViews: g.pricingViews,
      checkouts: g.checkouts,
      paid: g.paid,
      conversion: pct(g.paid, g.entrances || g.views),
    }))
    .sort((a, b) => b.views - a.views);
}

// Spec section 24 — separates "which pages get traffic" from "which pages
// make money," which a plain visits-per-page table can't answer on its
// own. Scoped to organic sessions only (isOrganicSession above); paid/
// direct/social traffic is already covered by Acquisition and Pages.
export async function getSeoOverview({ from, to }) {
  const allSessions = fetchSessionsInRange(from, to);
  const paymentEvents = fetchEventsInRange(from, to, ["payment_succeeded"]);
  const sessions = allSessions.filter(isOrganicSession);

  const revenueByUid = new Map();
  for (const e of paymentEvents) {
    if (!e.uid) continue;
    revenueByUid.set(e.uid, (revenueByUid.get(e.uid) || 0) + (e.props?.amountCents || 0));
  }

  const visitors = new Set(sessions.map(identityKey));
  const newVisitors = sessions.filter((s) => s.isNewVisitor).length;
  const masters = sessions.filter((s) => s.hasMastered).length;
  const paidSessions = sessions.filter((s) => s.hasPaid);
  const revenue = paidSessions.reduce((sum, s) => sum + (s.uid ? revenueByUid.get(s.uid) || 0 : 0), 0) / 100;

  const byPage = new Map();
  for (const s of sessions) {
    const key = s.landingPage || "/";
    if (!byPage.has(key)) byPage.set(key, { path: key, visitors: new Set(), activeMsTotal: 0, uploads: 0, masters: 0, checkouts: 0, paid: 0, revenueCents: 0 });
    const g = byPage.get(key);
    g.visitors.add(identityKey(s));
    g.activeMsTotal += s.activeMs || 0;
    if (s.hasUploaded) g.uploads++;
    if (s.hasMastered) g.masters++;
    if (s.hasStartedCheckout) g.checkouts++;
    if (s.hasPaid) {
      g.paid++;
      g.revenueCents += s.uid ? revenueByUid.get(s.uid) || 0 : 0;
    }
  }

  return {
    organicVisitors: visitors.size,
    organicNewVisitors: newVisitors,
    organicMasters: masters,
    organicCustomers: paidSessions.length,
    organicRevenue: revenue,
    organicVisitorToPaid: pct(paidSessions.length, visitors.size),
    pages: [...byPage.values()]
      .map((g) => ({
        path: g.path,
        visitors: g.visitors.size,
        avgActiveSeconds: g.visitors.size ? Math.round(g.activeMsTotal / g.visitors.size / 1000) : 0,
        uploads: g.uploads,
        masters: g.masters,
        checkouts: g.checkouts,
        paid: g.paid,
        revenue: Math.round(g.revenueCents) / 100,
        conversion: pct(g.paid, g.visitors.size),
      }))
      .sort((a, b) => b.visitors - a.visitors),
  };
}

export async function getSales({ from, to }) {
  const paymentEvents = fetchEventsInRange(from, to, ["payment_succeeded"]);
  const failedEvents = fetchEventsInRange(from, to, ["checkout_failed"]);
  const subCreated = fetchEventsInRange(from, to, ["subscription_created"]);
  const subRenewed = fetchEventsInRange(from, to, ["subscription_renewed"]);
  const subCancelled = fetchEventsInRange(from, to, ["subscription_cancelled"]);
  const subExpired = fetchEventsInRange(from, to, ["subscription_expired"]);
  const refunds = fetchEventsInRange(from, to, ["refund_created"]);
  const sessions = fetchSessionsInRange(from, to);

  const revenue = paymentEvents.reduce((sum, e) => sum + (e.props?.amountCents || 0), 0) / 100;
  const checkoutStarted = sessions.filter((s) => s.hasStartedCheckout).length;
  const checkoutSucceeded = sessions.filter((s) => s.hasPaid).length;
  const abandoned = sessions.filter((s) => s.hasStartedCheckout && !s.hasPaid && Date.now() - (s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0) > CHECKOUT_ABANDON_MS).length;

  const failureReasons = {};
  for (const e of failedEvents) {
    const reason = e.props?.reason || "unknown";
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
  }

  return {
    revenue,
    newCustomers: paymentEvents.filter((e) => e.props?.isFirstPurchase).length || paymentEvents.length,
    subscriptionsCreated: subCreated.length,
    renewals: subRenewed.length,
    cancellations: subCancelled.length,
    expirations: subExpired.length,
    refunds: refunds.length,
    checkout: {
      started: checkoutStarted,
      succeeded: checkoutSucceeded,
      failed: failedEvents.length,
      abandoned,
    },
    failureReasons: Object.entries(failureReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

const FAILURE_EVENT_NAMES = ["audio_upload_failed", "analysis_failed", "master_failed", "checkout_failed"];

// master_* is written twice: by the browser (masteringStore.js, including
// preview renders and client-side network errors) and by the server
// (masteringRoutes.js, real renders only, with a normalized `reason`).
// Counting both doubled every mastering failure. The server copy is the
// authoritative one.
const SERVER_AUTHORITATIVE = new Set(["master_started", "master_completed", "master_failed"]);
function authoritative(events) {
  return events.filter((e) => !(SERVER_AUTHORITATIVE.has(e.name) && e.source === "frontend"));
}

export async function getErrors({ from, to, prevFrom, prevTo }) {
  const events = authoritative(fetchEventsInRange(from, to, FAILURE_EVENT_NAMES));
  const prevEvents = authoritative(fetchEventsInRange(prevFrom, prevTo, FAILURE_EVENT_NAMES));

  const countBy = (list) => {
    const map = new Map();
    for (const e of list) {
      const reason = e.props?.reason || "unknown";
      const key = `${e.name}:${reason}`;
      if (!map.has(key)) map.set(key, { name: e.name, reason, count: 0, sessions: new Set(), firstSeen: e.ts, lastSeen: e.ts });
      const entry = map.get(key);
      entry.count++;
      if (e.sessionId) entry.sessions.add(e.sessionId);
      if (new Date(e.ts) < new Date(entry.firstSeen)) entry.firstSeen = e.ts;
      if (new Date(e.ts) > new Date(entry.lastSeen)) entry.lastSeen = e.ts;
    }
    return map;
  };

  const current = countBy(events);
  const previous = countBy(prevEvents);

  return [...current.values()]
    .map((e) => ({
      event: e.name,
      reason: e.reason,
      count: e.count,
      affectedSessions: e.sessions.size,
      firstSeen: e.firstSeen || null,
      lastSeen: e.lastSeen || null,
      previousCount: previous.get(`${e.name}:${e.reason}`)?.count || 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function listSessions({ from, to, filters, limit = 50, cursor }) {
  // cursor is a plain row offset (opaque to the caller — the frontend
  // never inspects it, just echoes whatever nextCursor comes back). Plain
  // OFFSET is the right amount of complexity here: this dataset is one
  // admin's date-range query at a time, not a high-traffic paginated
  // public endpoint where OFFSET's O(n) cost would matter.
  const offset = Number(cursor) > 0 ? Number(cursor) : 0;
  const rows = db()
    .prepare("SELECT * FROM analytics_sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at DESC LIMIT ? OFFSET ?")
    .all(from.toISOString(), to.toISOString(), limit, offset);
  let sessions = rows.map(sessionFromRow);
  sessions = applySessionFilters(sessions, filters);
  return { sessions, nextCursor: rows.length === limit ? String(offset + limit) : null };
}

export async function getSessionDetail(sessionId) {
  const sessionRow = db().prepare("SELECT * FROM analytics_sessions WHERE session_id = ?").get(sessionId);
  if (!sessionRow) return null;
  const eventRows = db().prepare("SELECT * FROM analytics_events WHERE session_id = ? ORDER BY ts ASC").all(sessionId);
  return { session: sessionFromRow(sessionRow), events: eventRows.map(eventFromRow) };
}

const LIVE_WINDOW_MS = 5 * 60 * 1000;

// "Real-time" here means "active in the last 5 minutes," refreshed by
// polling (see the frontend Live page) — not a websocket/SSE push feed.
// lastSeenAt is already updated on every event/heartbeat a session sends
// (ingestBatch), so this needs no new tracking, just a query scoped to
// "recently," instead of the explicit from/to range every other report
// here takes.
export async function getLive() {
  const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  const rows = db().prepare("SELECT * FROM analytics_sessions WHERE last_seen_at >= ?").all(since);
  const sessions = rows.map(sessionFromRow);

  const countryCounts = new Map();
  const pageCounts = new Map();
  let activeMsTotal = 0;
  for (const s of sessions) {
    const country = s.country || "Unknown";
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    const page = s.exitPage || s.landingPage || "/";
    pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
    activeMsTotal += s.activeMs || 0;
  }

  const sortedByCount = (map, key) =>
    [...map.entries()].map(([k, count]) => ({ [key]: k, visitors: count })).sort((a, b) => b.visitors - a.visitors);

  return {
    windowMinutes: LIVE_WINDOW_MS / 60000,
    activeVisitors: new Set(sessions.map((s) => s.visitorId)).size,
    avgActiveSeconds: sessions.length ? Math.round(activeMsTotal / sessions.length / 1000) : 0,
    countries: sortedByCount(countryCounts, "country"),
    pages: sortedByCount(pageCounts, "path"),
  };
}

// Deliberately visitorId-only, not identityKey() — retention/"did they
// come back" is a browser/device-return-rate question, distinct from the
// "how many distinct people" question the other reports ask. Folding
// logged-in cross-device visits together here would hide the exact thing
// this report exists to measure (whether the same browser came back).
export async function getRetention({ from, to }) {
  const sessions = fetchSessionsInRange(from, to);
  const visitorFirstLastSeen = new Map();
  for (const s of sessions) {
    const started = s.startedAt ? new Date(s.startedAt).getTime() : 0;
    const existing = visitorFirstLastSeen.get(s.visitorId);
    if (!existing) visitorFirstLastSeen.set(s.visitorId, { first: started, last: started, sessionCount: 1 });
    else {
      existing.first = Math.min(existing.first, started);
      existing.last = Math.max(existing.last, started);
      existing.sessionCount++;
    }
  }
  const uniqueVisitors = visitorFirstLastSeen.size;
  const returned = [...visitorFirstLastSeen.values()].filter((v) => v.sessionCount > 1).length;
  return {
    uniqueVisitors,
    returningVisitors: returned,
    returningPct: pct(returned, uniqueVisitors),
  };
}
