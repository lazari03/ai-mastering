import express from "express";

import { verifyWebhook, applyWebhookEvent, WebhookVerificationError } from "../services/polarService.js";

const router = express.Router();

// Mounted in server.js BEFORE express.json() — validateEvent needs the
// raw, unparsed request body to verify the signature; JSON-parsing it
// first would make verification fail (or worse, silently verify against
// re-serialized JSON that doesn't byte-for-byte match what Polar signed).
router.post("/webhooks/polar", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return res.status(403).send("");
    }
    console.error("Polar webhook verification threw unexpectedly:", error);
    return res.status(400).send("");
  }

  try {
    await applyWebhookEvent(event);
  } catch (error) {
    // Ack anyway — Polar retries on non-2xx, and retrying a Firestore
    // hiccup won't fix a bug in our own handler. Log loudly instead.
    console.error(`Failed to apply Polar webhook event ${event.type}:`, error);
  }

  return res.status(202).send("");
});

export default router;
