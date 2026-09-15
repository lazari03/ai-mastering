import express from "express";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { analyticsCollectLimiter } from "../middleware/rateLimit.js";
import { ingestBatch } from "../services/analyticsService.js";
import {
  resolveRange,
  getOverview,
  getFunnel,
  getAcquisition,
  getPages,
  getSales,
  getErrors,
  listSessions,
  getSessionDetail,
  getRetention,
} from "../services/analyticsQueryService.js";

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
      ip: req.ip,
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

admin.get("/overview", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getOverview(range);
    return res.json(data);
  } catch (error) {
    console.error("admin/overview failed:", error);
    return res.status(500).json({ detail: "Failed to load overview." });
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

admin.get("/acquisition", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getAcquisition(range);
    return res.json(data);
  } catch (error) {
    console.error("admin/acquisition failed:", error);
    return res.status(500).json({ detail: "Failed to load acquisition." });
  }
});

admin.get("/pages", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getPages(range);
    return res.json(data);
  } catch (error) {
    console.error("admin/pages failed:", error);
    return res.status(500).json({ detail: "Failed to load pages." });
  }
});

admin.get("/sales", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getSales(range);
    return res.json(data);
  } catch (error) {
    console.error("admin/sales failed:", error);
    return res.status(500).json({ detail: "Failed to load sales." });
  }
});

admin.get("/errors", async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await getErrors(range);
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
