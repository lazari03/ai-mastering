import express from "express";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { listUsers, getUserDetail, sendPasswordReset, setUserDisabled } from "../services/adminUsersService.js";
import { reconcileUserSubscription } from "../services/polarService.js";

const router = express.Router();

// Mounted at /users/admin/*, never /admin/* — server.js's global auth gate
// bypasses anything starting with "/admin/" (reserved for the legacy
// shared-secret preset-management routes), so a real authenticated admin
// surface has to live outside that prefix. Same shape as
// analyticsRoutes.js's own admin sub-router.
const admin = express.Router();
admin.use(requireAdmin);

admin.get("/list", async (req, res) => {
  try {
    const data = await listUsers({ pageToken: req.query.pageToken || null, search: req.query.search || null });
    return res.json(data);
  } catch (error) {
    console.error("admin/users/list failed:", error);
    return res.status(500).json({ detail: "Failed to load users." });
  }
});

admin.get("/:uid", async (req, res) => {
  try {
    const data = await getUserDetail(req.params.uid);
    return res.json(data);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return res.status(404).json({ detail: "User not found." });
    }
    console.error("admin/users/:uid failed:", error);
    return res.status(500).json({ detail: "Failed to load user detail." });
  }
});

admin.post("/:uid/reset-password", async (req, res) => {
  try {
    const result = await sendPasswordReset(req.params.uid);
    return res.json(result);
  } catch (error) {
    console.error("admin/users/:uid/reset-password failed:", error);
    return res.status(400).json({ detail: error?.message || "Failed to send password reset." });
  }
});

// On-demand version of the periodic reconciliation pass (polarService.js's
// reconcileAllSubscriptions), for exactly the case that pass can't catch:
// a user whose subscription webhook never landed at all, so Firestore has
// no subscription field to reconcile FROM in the first place (the batch
// job only re-checks users who already have one on file — see its own
// comment). Asks Polar directly for this uid's real subscriptions and
// writes them into Firestore, same shape a working webhook would have.
admin.post("/:uid/resync-subscription", async (req, res) => {
  try {
    const changed = await reconcileUserSubscription(req.params.uid);
    if (!changed) {
      return res.status(404).json({ detail: "Polar has no subscription on file for this customer — nothing to sync." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("admin/users/:uid/resync-subscription failed:", error);
    return res.status(400).json({ detail: error?.message || "Failed to resync subscription from Polar." });
  }
});

admin.post("/:uid/disabled", async (req, res) => {
  try {
    const result = await setUserDisabled(req.params.uid, Boolean(req.body?.disabled));
    return res.json(result);
  } catch (error) {
    console.error("admin/users/:uid/disabled failed:", error);
    return res.status(400).json({ detail: error?.message || "Failed to update account status." });
  }
});

router.use("/users/admin", admin);

export default router;
