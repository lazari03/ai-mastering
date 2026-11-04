import fs from "node:fs";

import express from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { SUPPORTED_SCOPES } from "./config.js";
import { createOAuthProvider } from "./oauthProvider.js";
import { createSignedUrls } from "./signedUrls.js";
import { createJobRunner } from "./jobRunner.js";
import { createFileRouter } from "./fileRoutes.js";
import { buildMcpServer } from "./tools.js";
import { createRateLimiter } from "./toolError.js";

// Assembles the ChatGPT/MCP integration from injected dependencies (the
// production ones are wired in bootstrap.js; tests pass fakes). Returns:
//   publicRouter  — mount at the app root BEFORE express.json(), the
//                   general IP rate limiter and the Firebase auth gate:
//                   OAuth AS endpoints + metadata, POST /mcp, upload and
//                   download routes. Each authenticates on its own (OAuth
//                   bearer token, PKCE/client auth, or a presigned token).
//   consentRouter — mount AFTER the Firebase requireAuth gate: the two
//                   endpoints the frontend consent page calls.
//   start()/stop(), revokeUser(uid), deleteUserData(uid)

const REQUEST_ID_RE = /^[a-f0-9]{48}$/;

function jsonRpcError(res, status, code, message) {
  return res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

export function createMcpIntegration({ config, store, deps, log = console }) {
  const now = deps.now || (() => Date.now());
  const limiter = createRateLimiter({ now });
  const signedUrls = createSignedUrls({ secret: deps.secret, now });
  const oauth = createOAuthProvider({ store, config, checkUser: deps.checkUser, now, log });
  const jobRunner = createJobRunner({ ...deps, store, config, log });

  const toolDeps = {
    config,
    store,
    limiter,
    jobRunner,
    signedUrls,
    readUserData: deps.readUserData,
    planFromUserData: deps.planFromUserData,
    subscriptionStatusFromUserData: deps.subscriptionStatusFromUserData,
    entitlementsFromUserData: deps.entitlementsFromUserData,
    getMixPresetByName: deps.getMixPresetByName,
    jobsService: deps.jobsService,
    now,
  };

  const resourceMetadataUrl = `${config.publicOrigin}/.well-known/oauth-protected-resource/mcp`;
  const ipKey = (req) => ipKeyGenerator(req.clientIp || req.ip || "unknown");
  const clientKey = (req) => (req.body?.client_id ? `client:${String(req.body.client_id).slice(0, 80)}` : ipKey(req));

  const publicRouter = express.Router();

  // ---- OAuth 2.1 authorization server (MCP SDK) -------------------------
  // Confidential clients are authenticated against a stored hash before the
  // SDK's handlers run (see oauthProvider.tokenGuard).
  const urlencoded = express.urlencoded({ extended: false, limit: "16kb" });
  publicRouter.use("/token", urlencoded, oauth.tokenGuard);
  publicRouter.use("/revoke", urlencoded, oauth.tokenGuard);
  publicRouter.use(
    mcpAuthRouter({
      provider: oauth.provider,
      issuerUrl: new URL(config.issuer),
      resourceServerUrl: new URL(config.resourceUrl),
      scopesSupported: SUPPORTED_SCOPES,
      resourceName: "Auralith Forge",
      serviceDocumentationUrl: new URL(`${config.publicOrigin}/`),
      // Browser-driven (/authorize) traffic is keyed by IP; machine-to-
      // machine traffic from ChatGPT shares OpenAI's IPs, so /token and
      // /revoke are keyed by client instead.
      authorizationOptions: { rateLimit: { windowMs: 15 * 60 * 1000, limit: 300, max: 300, keyGenerator: ipKey, validate: false } },
      tokenOptions: { rateLimit: { windowMs: 15 * 60 * 1000, limit: 600, max: 600, keyGenerator: clientKey, validate: false } },
      revocationOptions: { rateLimit: { windowMs: 15 * 60 * 1000, limit: 300, max: 300, keyGenerator: clientKey, validate: false } },
      clientRegistrationOptions: {
        clientSecretExpirySeconds: 0,
        rateLimit: { windowMs: 60 * 60 * 1000, limit: deps.registerPerHour || 200, max: deps.registerPerHour || 200, keyGenerator: ipKey, validate: false },
      },
    }),
  );
  // RFC 9728 path-suffixed metadata is served by the SDK router above
  // (/.well-known/oauth-protected-resource/mcp); OpenAI's docs show the
  // root form, so serve the same document there too.
  const prm = {
    resource: config.resourceUrl,
    authorization_servers: [new URL(config.issuer).href],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Auralith Forge",
    resource_documentation: `${config.publicOrigin}/`,
    resource_policy_uri: `${config.publicOrigin}/privacy`,
    resource_tos_uri: `${config.publicOrigin}/terms`,
  };
  publicRouter.get("/.well-known/oauth-protected-resource", (_req, res) => res.json(prm));

  // OpenAI plugin domain verification.
  publicRouter.get("/.well-known/openai-apps-challenge", (_req, res) => {
    if (!config.openaiChallengeToken) return res.status(404).type("text/plain").send("Not found");
    return res.type("text/plain").send(config.openaiChallengeToken);
  });

  // ---- MCP resource server ---------------------------------------------
  const bearer = requireBearerAuth({ verifier: oauth.provider, resourceMetadataUrl, expectedResource: new URL(config.resourceUrl) });
  const perUserBudget = (req, res, next) => {
    if (!limiter.hit(`requests:${req.auth.extra.uid}`, config.rateLimits.requests)) {
      res.setHeader("Retry-After", "60");
      return jsonRpcError(res, 429, -32000, "Too many requests — wait a minute and try again.");
    }
    return next();
  };

  publicRouter.post("/mcp", bearer, perUserBudget, express.json({ limit: "256kb" }), async (req, res) => {
    const server = buildMcpServer({ auth: req.auth, deps: toolDeps });
    // Stateless Streamable HTTP: one transport per request, JSON responses.
    // Nothing is held between calls, so a restart or a second request never
    // depends on in-memory session state.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error?.("MCP request failed:", error);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, "Internal server error");
    }
  });
  // No server-initiated streams or sessions in stateless mode.
  for (const method of ["get", "delete"]) {
    publicRouter[method]("/mcp", bearer, (_req, res) => {
      res.setHeader("Allow", "POST");
      return jsonRpcError(res, 405, -32000, "Method not allowed.");
    });
  }

  publicRouter.use(
    createFileRouter({
      store,
      config,
      signedUrls,
      uploadDir: deps.uploadDir,
      jobsService: deps.jobsService,
      pythonApiBaseUrl: deps.pythonApiBaseUrl,
      fetchImpl: deps.fetchImpl,
      log,
      now,
    }),
  );

  // ---- Consent API (behind the website's Firebase requireAuth) ----------
  const consentRouter = express.Router();
  consentRouter.get("/oauth/requests/:requestId", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { requestId } = req.params;
    const info = REQUEST_ID_RE.test(requestId) ? oauth.describePending(requestId) : null;
    if (!info) return res.status(410).json({ code: "request_expired", detail: "This connection request has expired. Start connecting again from ChatGPT." });
    return res.json({ ...info, account: { email: req.user?.email || null } });
  });
  consentRouter.post("/oauth/requests/:requestId/decision", express.json({ limit: "4kb" }), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { requestId } = req.params;
    if (!REQUEST_ID_RE.test(requestId)) return res.status(410).json({ code: "request_expired", detail: "This connection request has expired." });
    try {
      const out = req.body?.approve === true ? oauth.approve(requestId, { uid: req.user.uid, email: req.user.email }) : oauth.deny(requestId);
      return res.json(out);
    } catch (error) {
      return res.status(410).json({ code: "request_expired", detail: error?.message || "This connection request has expired." });
    }
  });

  // ---- Housekeeping ------------------------------------------------------
  function expireUploads() {
    for (const upload of store.expiredUploads()) {
      if (upload.file_path) fs.unlink(upload.file_path, () => {});
      store.markUploadExpired(upload.upload_id);
    }
  }

  let timer = null;
  async function sweep({ minAgeMs = 5 * 60 * 1000 } = {}) {
    try {
      expireUploads();
      store.purge();
      // Active jobs this process isn't running (a restart; a crash between
      // claim and launch) are settled. Young ones are skipped: a job is
      // claimed a moment before its runner starts.
      const orphaned = store.activeJobs().filter((j) => !jobRunner.isRunning(j.job_id) && now() - j.created_at >= minAgeMs);
      if (orphaned.length) await jobRunner.recover({ getJobRecord: deps.jobsService.getJob, only: new Set(orphaned.map((j) => j.job_id)) });
    } catch (error) {
      log.error?.("MCP housekeeping failed:", error.message);
    }
  }

  return {
    publicRouter,
    consentRouter,
    jobRunner,
    oauth,
    signedUrls,
    store,
    sweep,
    start({ intervalMs = 5 * 60 * 1000 } = {}) {
      // On boot nothing is running in this process yet: settle everything.
      sweep({ minAgeMs: 0 });
      timer = setInterval(() => sweep(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      limiter.stop();
    },
    revokeUser: (uid, reason) => store.revokeGrantsForUser(uid, reason),
    deleteUserData(uid) {
      for (const file of store.deleteAllForUser(uid)) fs.unlink(file, () => {});
    },
  };
}
