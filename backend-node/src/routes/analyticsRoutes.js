import express from "express";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { analyticsCollectLimiter } from "../middleware/rateLimit.js";
import { ingestBatch } from "../services/analyticsService.js";
import {
  resolveRange,
  getOverview,
  getOverviewTimeseries,
  getFunnel,
  getAcquisition,
  getPages,
  getSeoOverview,
  getSales,
  getErrors,
  listSessions,
  getSessionDetail,
  getRetention,
  getLive,
} from "../services/analyticsQueryService.js";
import { getBehavior } from "../services/analyticsBehaviorService.js";
import { toCsv } from "../services/csvExportService.js";
import { buildReportPdf } from "../services/pdfExportService.js";

// Shared CSV/PDF export helper — every report below already computes its
// data via one of the query functions above; this just adds a second
// response shape (format=csv / format=pdf) alongside the existing res.json
// default, rather than a parallel set of dedicated /export routes that
// could drift from the JSON shape over time. rangeLabel is a plain string
// ("Jan 1 - Jan 31, 2026") shown on the PDF's header — computed by the
// caller from the same `range` it already resolved for the JSON path.
function sendExport(req, res, { title, rangeLabel, statCards = [], tableSections = [] }) {
  const format = req.query.format;
  const filenameBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (format === "csv") {
    const section = tableSections[0];
    if (!section) return res.status(400).json({ detail: "This report has no tabular data to export as CSV." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
    return res.send(toCsv(section.columns, section.rows));
  }
  if (format === "pdf") {
    return buildReportPdf({ title, dateRange: rangeLabel, statCards, tableSections })
      .then((buffer) => {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
        res.send(buffer);
      })
      .catch((error) => {
        console.error(`PDF export failed for "${title}":`, error);
        res.status(500).json({ detail: "Failed to generate PDF report." });
      });
  }
  return null; // caller falls through to its normal res.json(data)
}

function rangeLabelFrom(range) {
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

// Overview/Sales stat fields come back as either a bare number or a
// withDelta() shape ({value, previous, deltaPct}) — same duck-typing
// StatCard.jsx already does on the frontend for the identical reason.
function statValue(v) {
  return v && typeof v === "object" && "value" in v ? v.value : v;
}

const router = express.Router();

// ---------------------------------------------------------------------
// PUBLIC ingestion — no auth. Most page views happen before any Firebase
// interaction exists at all (a first-time visitor on the homepage has no
// token, not even an anonymous one), so this cannot require requireAuth —
// see server.js's bypass list. Everything here is instead protected by:
// rate limiting (analyticsCollectLimiter), a strict event-name allowlist
// and payload sanitizer (analyticsService.js), and small hard caps on
// batch size/property count so this can never become an arbitrary JSON
// storage sink (spec section 32).
// ---------------------------------------------------------------------
router.post("/analytics/collect", analyticsCollectLimiter, async (req, res) => {
  const body = req.body || {};
  try {
    const result = await ingestBatch({
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      uid: typeof body.uid === "string" && body.uid.length <= 128 ? body.uid : null,
      isNewSession: Boolean(body.isNewSession),
      ua: req.headers["user-agent"],
      ip: req.clientIp || req.ip,
      country: req.clientCountry || null,
      context: body.context || {},
      events: body.events,
    });
    return res.status(202).json(result);
  } catch (error) {
    // Analytics ingestion failing must never look like a real API error to
    // whatever's watching network traffic, and must never throw on the
    // client either (spec section 31) — the frontend client already
    // treats this as fire-and-forget, but a clean 4xx/5xx-free response
    // keeps it that way rather than training the client to retry-storm.
    console.error("Analytics ingestion failed (non-fatal):", error.message);
    return res.status(error.status === 400 ? 400 : 202).json({ accepted: 0 });
  }
});

// ---------------------------------------------------------------------
// ADMIN — every route below requires a verified Firebase session AND
// role === "admin" on that user's Firestore doc (requireAdmin.js).
// Mounted under /analytics/admin/*, never /admin/* — server.js's global
// auth gate explicitly bypasses anything starting with "/admin/" (that
// prefix is reserved for the legacy shared-secret preset-management
// routes in masteringRoutes.js), so putting real user-authenticated admin
// routes there would have skipped requireAuth entirely.
// ---------------------------------------------------------------------
const admin = express.Router();
admin.use(requireAdmin);

// No date-range params — "live" always means "right now," see getLive's
// own fixed 5-minute window.
admin.get("/live", async (req, res) => {
  try {
    const data = await getLive();
    return res.json(data);
  } catch (error) {
    console.error("admin/live failed:", error);
    return res.status(500).json({ detail: "Failed to load live overview." });
  }
});

// What visitors do, where they stop, and a ranked "fix next" list — see
// analyticsBehaviorService.js.
admin.get("/behavior", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    return res.json(await getBehavior(range));
  } catch (error) {
    console.error("admin/behavior failed:", error);
    return res.status(500).json({ detail: "Failed to load behavior insights." });
  }
});

admin.get("/overview", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getOverview(range);
    if (req.query.format) {
      const statCards = [
        { label: "Visitors", value: statValue(data.visitors) },
        { label: "New Visitors", value: statValue(data.newVisitors) },
        { label: "Signups", value: statValue(data.signups) },
        { label: "Uploads", value: statValue(data.uploads) },
        { label: "Masters", value: statValue(data.masters) },
        { label: "New Customers", value: statValue(data.newCustomers) },
        { label: "Revenue", value: statValue(data.revenue), suffix: " €" },
        { label: "MRR", value: Math.round(data.mrr), suffix: " €" },
        { label: "Active Subscribers", value: data.activeSubscribers },
      ];
      const exported = sendExport(req, res, {
        title: "Overview",
        rangeLabel: rangeLabelFrom(range),
        statCards,
        tableSections: [
          {
            columns: [
              { key: "metric", label: "Metric" },
              { key: "value", label: "Value" },
            ],
            rows: statCards.map((c) => ({ metric: c.label, value: `${c.value}${c.suffix || ""}` })),
          },
        ],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/overview failed:", error);
    return res.status(500).json({ detail: "Failed to load overview." });
  }
});

// Day-bucketed visitors/masters/revenue for the Overview page's trend
// chart — separate endpoint from /overview (see getOverviewTimeseries's
// own comment) so the common case of just wanting the headline stat
// cards isn't forced to also compute a daily breakdown.
admin.get("/overview-timeseries", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getOverviewTimeseries(range);
    return res.json({ points: data });
  } catch (error) {
    console.error("admin/overview-timeseries failed:", error);
    return res.status(500).json({ detail: "Failed to load overview trend." });
  }
});

admin.get("/funnel", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const filters = {
      source: req.query.source || null,
      device: req.query.device || null,
      country: req.query.country || null,
      landingPage: req.query.landingPage || null,
      newOrReturning: req.query.newOrReturning || null,
    };
    const data = await getFunnel({ ...range, filters });
    return res.json(data);
  } catch (error) {
    console.error("admin/funnel failed:", error);
    return res.status(500).json({ detail: "Failed to load funnel." });
  }
});

const ACQUISITION_EXPORT_COLUMNS = [
  { key: "source", label: "Source" },
  { key: "visitors", label: "Visitors" },
  { key: "newVisitors", label: "New" },
  { key: "uploads", label: "Uploads" },
  { key: "masters", label: "Masters" },
  { key: "checkouts", label: "Checkouts" },
  { key: "customers", label: "Paid" },
  { key: "revenue", label: "Revenue (€)", render: (r) => r.revenue.toFixed(2) },
  { key: "conversion", label: "Conv. (%)" },
];

admin.get("/acquisition", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getAcquisition(range);
    if (req.query.format) {
      const exported = sendExport(req, res, {
        title: "Acquisition",
        rangeLabel: rangeLabelFrom(range),
        tableSections: [{ title: "Acquisition", columns: ACQUISITION_EXPORT_COLUMNS, rows: data }],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/acquisition failed:", error);
    return res.status(500).json({ detail: "Failed to load acquisition." });
  }
});

const PAGES_EXPORT_COLUMNS = [
  { key: "path", label: "Page" },
  { key: "views", label: "Views" },
  { key: "uniqueVisitors", label: "Unique" },
  { key: "entrances", label: "Entrances" },
  { key: "exits", label: "Exits" },
  { key: "avgActiveSeconds", label: "Avg Active (s)" },
  { key: "uploads", label: "Uploads" },
  { key: "masters", label: "Masters" },
  { key: "paid", label: "Paid" },
  { key: "conversion", label: "Conv. (%)" },
];

admin.get("/pages", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getPages(range);
    if (req.query.format) {
      const exported = sendExport(req, res, {
        title: "Pages",
        rangeLabel: rangeLabelFrom(range),
        tableSections: [{ title: "Pages", columns: PAGES_EXPORT_COLUMNS, rows: data }],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/pages failed:", error);
    return res.status(500).json({ detail: "Failed to load pages." });
  }
});

const SEO_EXPORT_COLUMNS = [
  { key: "path", label: "Landing Page" },
  { key: "visitors", label: "Visitors" },
  { key: "avgActiveSeconds", label: "Avg Active (s)" },
  { key: "uploads", label: "Uploads" },
  { key: "masters", label: "Masters" },
  { key: "checkouts", label: "Checkouts" },
  { key: "paid", label: "Paid" },
  { key: "revenue", label: "Revenue (€)", render: (r) => r.revenue.toFixed(2) },
  { key: "conversion", label: "Conv. (%)" },
];

admin.get("/seo", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getSeoOverview(range);
    if (req.query.format) {
      const statCards = [
        { label: "Organic Visitors", value: data.organicVisitors },
        { label: "Organic New Visitors", value: data.organicNewVisitors },
        { label: "Organic Masters", value: data.organicMasters },
        { label: "Organic Customers", value: data.organicCustomers },
        { label: "Organic Revenue", value: data.organicRevenue.toFixed(2), suffix: " €" },
        { label: "Visitor → Paid", value: data.organicVisitorToPaid, suffix: "%" },
      ];
      const exported = sendExport(req, res, {
        title: "SEO",
        rangeLabel: rangeLabelFrom(range),
        statCards,
        tableSections: [{ title: "Organic Landing Pages", columns: SEO_EXPORT_COLUMNS, rows: data.pages }],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/seo failed:", error);
    return res.status(500).json({ detail: "Failed to load SEO overview." });
  }
});

admin.get("/sales", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getSales(range);
    if (req.query.format) {
      const statCards = [
        { label: "Revenue", value: data.revenue.toFixed(2), suffix: " €" },
        { label: "New Customers", value: data.newCustomers },
        { label: "Subscriptions Created", value: data.subscriptionsCreated },
        { label: "Renewals", value: data.renewals },
        { label: "Cancellations", value: data.cancellations },
        { label: "Refunds", value: data.refunds },
        { label: "Checkout Started", value: data.checkout.started },
        { label: "Checkout Succeeded", value: data.checkout.succeeded },
        { label: "Checkout Failed", value: data.checkout.failed },
        { label: "Checkout Abandoned", value: data.checkout.abandoned },
      ];
      const exported = sendExport(req, res, {
        title: "Sales",
        rangeLabel: rangeLabelFrom(range),
        statCards,
        tableSections: [
          {
            title: "Checkout Failure Reasons",
            columns: [
              { key: "reason", label: "Reason" },
              { key: "count", label: "Count" },
            ],
            rows: data.failureReasons,
          },
        ],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/sales failed:", error);
    return res.status(500).json({ detail: "Failed to load sales." });
  }
});

const ERRORS_EXPORT_COLUMNS = [
  { key: "event", label: "Event" },
  { key: "reason", label: "Reason" },
  { key: "count", label: "Count" },
  { key: "affectedSessions", label: "Sessions" },
  { key: "lastSeen", label: "Last Seen" },
];

admin.get("/errors", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getErrors(range);
    if (req.query.format) {
      const exported = sendExport(req, res, {
        title: "Errors",
        rangeLabel: rangeLabelFrom(range),
        tableSections: [{ title: "Errors", columns: ERRORS_EXPORT_COLUMNS, rows: data }],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/errors failed:", error);
    return res.status(500).json({ detail: "Failed to load errors." });
  }
});

admin.get("/retention", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getRetention(range);
    return res.json(data);
  } catch (error) {
    console.error("admin/retention failed:", error);
    return res.status(500).json({ detail: "Failed to load retention." });
  }
});

const SESSIONS_EXPORT_COLUMNS = [
  { key: "startedAt", label: "Started" },
  { key: "authenticated", label: "Registered", render: (r) => (r.authenticated ? "yes" : "no") },
  { key: "source", label: "Source", render: (r) => r.utmSource || r.referrerDomain || "direct" },
  { key: "deviceCategory", label: "Device" },
  { key: "country", label: "Country" },
  { key: "landingPage", label: "Landing Page" },
  { key: "pageViewCount", label: "Pages" },
  { key: "hasMastered", label: "Mastered", render: (r) => (r.hasMastered ? "yes" : "no") },
  { key: "hasPaid", label: "Paid", render: (r) => (r.hasPaid ? "yes" : "no") },
];

// Exports the current page only (up to `limit` rows, same as the on-screen
// table) — not every session ever recorded for the date range. Consistent
// with the confirmed export-scope decision (current view, not a combined
// full-history dump) and avoids one export request trying to page through
// an unbounded number of Firestore reads.
admin.get("/sessions", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const filters = {
      source: req.query.source || null,
      device: req.query.device || null,
      country: req.query.country || null,
      newOrReturning: req.query.newOrReturning || null,
    };
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const data = await listSessions({ ...range, filters, limit, cursor: req.query.cursor || null });
    if (req.query.format) {
      const exported = sendExport(req, res, {
        title: "Sessions",
        rangeLabel: rangeLabelFrom(range),
        tableSections: [{ title: "Sessions", columns: SESSIONS_EXPORT_COLUMNS, rows: data.sessions }],
      });
      if (exported !== null) return exported;
    }
    return res.json(data);
  } catch (error) {
    console.error("admin/sessions failed:", error);
    return res.status(500).json({ detail: "Failed to load sessions." });
  }
});

admin.get("/sessions/:sessionId", async (req, res) => {
  try {
    const data = await getSessionDetail(req.params.sessionId);
    if (!data) return res.status(404).json({ detail: "Session not found." });
    return res.json(data);
  } catch (error) {
    console.error("admin/sessions/:id failed:", error);
    return res.status(500).json({ detail: "Failed to load session detail." });
  }
});

// Confirms admin access for the frontend's own gate (redirect-away logic)
// without having to special-case a data endpoint for that check.
admin.get("/me", (req, res) => res.json({ ok: true }));

router.use("/analytics/admin", admin);

export default router;
