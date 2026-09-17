import { Timestamp } from "firebase-admin/firestore";

import { getFirestore } from "../config/firebase.js";
import { settings } from "../config/settings.js";
import { CHECKOUT_ABANDON_MS } from "./analyticsService.js";

// ---------------------------------------------------------------------
// Admin read/aggregation layer. Deliberately NOT a data warehouse (spec
// section 29/30): every function here reads the matching Firestore docs
// for the requested date range and reduces them in memory. That's the
// right amount of infrastructure for this app's actual traffic — if
// volume ever makes that slow, the fix is a scheduled rollup job writing
// daily summary docs, not swapping the whole storage model, and nothing
// below is structured in a way that would block adding that later.
// ---------------------------------------------------------------------

function db() {
  return getFirestore();
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

async function fetchSessionsInRange(from, to) {
  const snap = await db()
    .collection("analyticsSessions")
    .where("startedAt", ">=", Timestamp.fromDate(from))
    .where("startedAt", "<", Timestamp.fromDate(to))
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchEventsInRange(from, to, names = null) {
  let q = db().collection("analyticsEvents").where("ts", ">=", Timestamp.fromDate(from)).where("ts", "<", Timestamp.fromDate(to));
  const snap = await q.get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return names ? docs.filter((e) => names.includes(e.name)) : docs;
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

// Firestore Timestamp instances don't reliably JSON.stringify into
// anything a frontend can parse as a date — converted explicitly to ISO
// strings at the one boundary that actually sends this data over HTTP
// (analyticsRoutes.js's res.json()), rather than trusting default
// serialization for a type this app doesn't otherwise pass across that
// boundary anywhere else.
function serializeTimestamps(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = value?.toDate ? value.toDate().toISOString() : value;
  }
  return out;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

// PLANS pricing mirrored here for MRR estimation — see frontend/src/lib/
// pricing.js, the single source of truth for what these actually cost.
// Kept as a small constant map (not imported cross-project) since
// backend-node and frontend are separate deploys; if a price changes,
// update both.
const PLAN_MONTHLY_PRICE_EUR = { studio: 9.99, pro: 19.99 };

async function estimateSubscriptionStats() {
  const [studioSnap, proSnap, cancelledLast30dSnap] = await Promise.all([
    db().collection("users").where("subscription.status", "==", "active").where("subscription.productId", "==", settings.polarProducts.planStudio).count().get(),
    db().collection("users").where("subscription.status", "==", "active").where("subscription.productId", "==", settings.polarProducts.planPro).count().get(),
    Promise.resolve(null),
  ]);
  void cancelledLast30dSnap;
  const studioCount = studioSnap.data().count;
  const proCount = proSnap.data().count;
  const mrr = studioCount * PLAN_MONTHLY_PRICE_EUR.studio + proCount * PLAN_MONTHLY_PRICE_EUR.pro;
  return { activeSubscribers: studioCount + proCount, mrr: Math.round(mrr * 100) / 100 };
}

export async function getOverview({ from, to, prevFrom, prevTo }) {
  const [sessions, prevSessions, paymentEvents, prevPaymentEvents, cancelEvents, subStats] = await Promise.all([
    fetchSessionsInRange(from, to),
    fetchSessionsInRange(prevFrom, prevTo),
    fetchEventsInRange(from, to, ["payment_succeeded"]),
    fetchEventsInRange(prevFrom, prevTo, ["payment_succeeded"]),
    fetchEventsInRange(from, to, ["subscription_cancelled"]),
    estimateSubscriptionStats(),
  ]);

  const summarize = (list) => ({
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
    signups: withDelta(current.signups, previous.signups),
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
    conversion: {
      visitorToUpload: pct(current.uploads, current.visitors),
      visitorToMaster: pct(current.masters, current.visitors),
      visitorToPaid: withDelta(pct(current.paid, current.visitors), pct(previous.paid, previous.visitors)),
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
  const [sessions, paymentEvents] = await Promise.all([
    fetchSessionsInRange(from, to),
    fetchEventsInRange(from, to, ["payment_succeeded"]),
  ]);

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
    const started = s.startedAt?.toDate?.() || (s.startedAt ? new Date(s.startedAt) : null);
    if (!started) continue;
    const bucket = bucketFor(started);
    if (!bucket) continue;
    bucket.visitorIds.add(identityKey(s));
    if (s.hasMastered) bucket.masters++;
  }
  for (const e of paymentEvents) {
    const ts = e.ts?.toDate?.() || (e.ts ? new Date(e.ts) : null);
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
  const sessions = applySessionFilters(await fetchSessionsInRange(from, to), filters);
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
  const [sessions, paymentEvents] = await Promise.all([fetchSessionsInRange(from, to), fetchEventsInRange(from, to, ["payment_succeeded"])]);
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
  const [pageViewEvents, heartbeatEvents, sessions] = await Promise.all([
    fetchEventsInRange(from, to, ["page_view"]),
    fetchEventsInRange(from, to, ["heartbeat"]),
    fetchSessionsInRange(from, to),
  ]);

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
  const [allSessions, paymentEvents] = await Promise.all([fetchSessionsInRange(from, to), fetchEventsInRange(from, to, ["payment_succeeded"])]);
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
  const [paymentEvents, failedEvents, subCreated, subRenewed, subCancelled, subExpired, refunds, sessions] = await Promise.all([
    fetchEventsInRange(from, to, ["payment_succeeded"]),
    fetchEventsInRange(from, to, ["checkout_failed"]),
    fetchEventsInRange(from, to, ["subscription_created"]),
    fetchEventsInRange(from, to, ["subscription_renewed"]),
    fetchEventsInRange(from, to, ["subscription_cancelled"]),
    fetchEventsInRange(from, to, ["subscription_expired"]),
    fetchEventsInRange(from, to, ["refund_created"]),
    fetchSessionsInRange(from, to),
  ]);

  const revenue = paymentEvents.reduce((sum, e) => sum + (e.props?.amountCents || 0), 0) / 100;
  const checkoutStarted = sessions.filter((s) => s.hasStartedCheckout).length;
  const checkoutSucceeded = sessions.filter((s) => s.hasPaid).length;
  const abandoned = sessions.filter((s) => s.hasStartedCheckout && !s.hasPaid && Date.now() - (s.lastSeenAt?.toDate?.()?.getTime() || 0) > CHECKOUT_ABANDON_MS).length;

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

export async function getErrors({ from, to, prevFrom, prevTo }) {
  const [events, prevEvents] = await Promise.all([fetchEventsInRange(from, to, FAILURE_EVENT_NAMES), fetchEventsInRange(prevFrom, prevTo, FAILURE_EVENT_NAMES)]);

  const countBy = (list) => {
    const map = new Map();
    for (const e of list) {
      const reason = e.props?.reason || "unknown";
      const key = `${e.name}:${reason}`;
      if (!map.has(key)) map.set(key, { name: e.name, reason, count: 0, sessions: new Set(), firstSeen: e.ts, lastSeen: e.ts });
      const entry = map.get(key);
      entry.count++;
      if (e.sessionId) entry.sessions.add(e.sessionId);
      if (e.ts?.toDate?.() < entry.firstSeen?.toDate?.()) entry.firstSeen = e.ts;
      if (e.ts?.toDate?.() > entry.lastSeen?.toDate?.()) entry.lastSeen = e.ts;
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
      firstSeen: e.firstSeen?.toDate?.()?.toISOString() || null,
      lastSeen: e.lastSeen?.toDate?.()?.toISOString() || null,
      previousCount: previous.get(`${e.name}:${e.reason}`)?.count || 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function listSessions({ from, to, filters, limit = 50, cursor }) {
  let q = db().collection("analyticsSessions").where("startedAt", ">=", Timestamp.fromDate(from)).where("startedAt", "<", Timestamp.fromDate(to)).orderBy("startedAt", "desc").limit(limit);
  if (cursor) {
    const cursorSnap = await db().collection("analyticsSessions").doc(cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }
  const snap = await q.get();
  let sessions = snap.docs.map((d) => serializeTimestamps({ id: d.id, ...d.data() }));
  sessions = applySessionFilters(sessions, filters);
  return { sessions, nextCursor: snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null };
}

export async function getSessionDetail(sessionId) {
  const [sessionSnap, eventsSnap] = await Promise.all([
    db().collection("analyticsSessions").doc(sessionId).get(),
    db().collection("analyticsEvents").where("sessionId", "==", sessionId).orderBy("ts", "asc").get(),
  ]);
  if (!sessionSnap.exists) return null;
  const session = serializeTimestamps({ id: sessionSnap.id, ...sessionSnap.data() });
  const events = eventsSnap.docs.map((d) => serializeTimestamps({ id: d.id, ...d.data() }));
  return { session, events };
}

const LIVE_WINDOW_MS = 5 * 60 * 1000;

// "Real-time" here means "active in the last 5 minutes," refreshed by
// polling (see the frontend Live page) — not a websocket/SSE push feed.
// lastSeenAt is already updated on every event/heartbeat a session sends
// (ingestBatch), so this needs no new tracking, just a query scoped to
// "recently," instead of the explicit from/to range every other report
// here takes.
export async function getLive() {
  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  const snap = await db().collection("analyticsSessions").where("lastSeenAt", ">=", Timestamp.fromDate(since)).get();
  const sessions = snap.docs.map((d) => d.data());

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
  const [sessions, allVisitorsWithSecondVisit] = await Promise.all([fetchSessionsInRange(from, to), Promise.resolve(null)]);
  void allVisitorsWithSecondVisit;
  const visitorFirstLastSeen = new Map();
  for (const s of sessions) {
    const started = s.startedAt?.toDate?.()?.getTime() || 0;
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
