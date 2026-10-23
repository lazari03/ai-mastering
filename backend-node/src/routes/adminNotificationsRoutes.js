import express from "express";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { listNotifications, getUnreadCount, markRead, markAllRead } from "../services/adminNotificationService.js";

const router = express.Router();

// Mounted at /notifications/admin/*, never /admin/* — same route-mount
// constraint as adminUsersRoutes.js / analyticsRoutes.js.
const admin = express.Router();
admin.use(requireAdmin);

admin.get("/list", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const data = await listNotifications({ limit, cursor: req.query.cursor || null });
    return res.json(data);
  } catch (error) {
    console.error("admin/notifications/list failed:", error);
    return res.status(500).json({ detail: "Failed to load notifications." });
  }
});

admin.get("/unread-count", async (req, res) => {
  try {
    const count = await getUnreadCount();
    return res.json({ count });
  } catch (error) {
    console.error("admin/notifications/unread-count failed:", error);
    return res.status(500).json({ detail: "Failed to load unread count." });
  }
});

admin.post("/:id/read", async (req, res) => {
  try {
    const result = await markRead(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error("admin/notifications/:id/read failed:", error);
    return res.status(400).json({ detail: "Failed to mark notification read." });
  }
});

admin.post("/read-all", async (req, res) => {
  try {
    const result = await markAllRead();
    return res.json(result);
  } catch (error) {
    console.error("admin/notifications/read-all failed:", error);
    return res.status(400).json({ detail: "Failed to mark notifications read." });
  }
});

router.use("/notifications/admin", admin);

export default router;
