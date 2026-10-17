import express from "express";

import { verifyWebhook, applyWebhookEvent, WebhookVerificationError } from "../services/polarService.js";
import { getFirestore } from "../config/firebase.js";

const router = express.Router();

// Every verification/processing failure gets one doc here — this is the
// "alerting" for a payments webhook with no email/Slack/Sentry wired up
// anywhere else in the app: cheap, needs no new credentials, and gives an
// actual place to check ("has anything failed?") instead of the previous
// state of purely console.error lines nobody's watching in real time.
// Best-effort by design — a failure to log a failure must never itself
// break the response Polar is waiting on.
async function logWebhookFailure(reason, detail) {
  try {
    await getFirestore().collection("webhookFailures").add({
      provider: "polar",
      reason,
      detail: String(detail?.message || detail || ""),
      at: new Date(),
    });
  } catch (logError) {
    console.error("Failed to record webhook failure (non-fatal):", logError);
  }
}

// Unsigned/forged POSTs need no credentials, so recording each one would let
// anyone drive unbounded Firestore writes and bury real failures. Record at
// most one verification_failed doc per minute, carrying how many were
// suppressed since the last one.
const VERIFICATION_FAILURE_LOG_INTERVAL_MS = 60_000;
let lastVerificationFailureLoggedAt = 0;
let suppressedVerificationFailures = 0;
async function logVerificationFailure(error) {
  const now = Date.now();
  if (now - lastVerificationFailureLoggedAt < VERIFICATION_FAILURE_LOG_INTERVAL_MS) {
    suppressedVerificationFailures += 1;
    return;
  }
  const suppressed = suppressedVerificationFailures;
  lastVerificationFailureLoggedAt = now;
  suppressedVerificationFailures = 0;
  await logWebhookFailure("verification_failed", suppressed ? `${error?.message || error} (+${suppressed} suppressed in the previous window)` : error);
}

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
      await logVerificationFailure(error);
      return res.status(403).send("");
    }
    // validateEvent verifies the signature BEFORE parsing the type, so this
    // is an authentic event the installed SDK doesn't model (e.g.
    // subscription.paused / .resumed). Acknowledge it — a 400 made Polar
    // retry it forever and filled webhookFailures. reconcileAllSubscriptions
    // still picks up any state change it carried.
    if (error?.name === "SDKValidationError" && String(error.message).includes("Unknown event type")) {
      console.warn("Polar webhook: unhandled event type acknowledged:", error.message);
      return res.status(202).send("");
    }
    console.error("Polar webhook verification threw unexpectedly:", error);
    await logWebhookFailure("verification_error", error);
    return res.status(400).send("");
  }

  try {
    await applyWebhookEvent(event);
  } catch (error) {
    // Non-2xx here is deliberate, not an oversight — it's what makes Polar
    // retry (with backoff) instead of considering this event delivered.
    // applySubscriptionEvent already handles the one "nothing to do" case
    // (a malformed/unlinked customer) by warning and returning normally,
    // not throwing — so anything that actually reaches this catch is a
    // real failure to persist a subscription change (e.g. a transient
    // Firestore error), which is exactly the case a retry can fix.
    // Previously this always acked 202 regardless, which meant a single
    // transient write failure silently and permanently lost that
    // subscription update — Polar never retries a 2xx.
    console.error(`Failed to apply Polar webhook event ${event.type}:`, error);
    await logWebhookFailure(`processing_failed:${event.type}`, error);
    return res.status(500).send("");
  }

  return res.status(202).send("");
});

export default router;
