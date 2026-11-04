import path from "node:path";

// Configuration for the ChatGPT / MCP integration (src/mcp/). Everything is
// env-driven and the whole integration is OFF unless MCP_ENABLED=true, so
// deploying this code changes nothing until it is switched on, and rolling
// back is flipping one variable (see docs/mcp/README.md).
//
// Two hosts are involved, both already served by this node-api process:
//   * the MCP resource server, https://auralithforge.app/mcp (apex; Caddy
//     routes /mcp*, /.well-known/oauth-protected-resource* and the OpenAI
//     domain-verification path to node-api), and
//   * the OAuth authorization server, issuer https://api.auralithforge.app
//     (the API host, already routed to node-api in full), whose
//     /authorize, /token, /register and /revoke endpoints the MCP SDK's
//     auth router mounts at the issuer root.
// Users sign in on the existing frontend (Firebase) at the consent page,
// https://auralithforge.app/connect/authorize — the identity system is
// reused, not duplicated.

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function stripSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function loadMcpConfig(env = process.env) {
  const publicOrigin = stripSlash(env.MCP_PUBLIC_ORIGIN || "https://auralithforge.app");
  const issuer = stripSlash(env.MCP_OAUTH_ISSUER || "https://api.auralithforge.app");
  return {
    enabled: bool(env.MCP_ENABLED, false),
    publicOrigin,
    // Canonical MCP resource identifier (RFC 8707 / RFC 9728 `resource`).
    resourceUrl: `${publicOrigin}/mcp`,
    issuer,
    consentUrl: env.MCP_CONSENT_URL || `${publicOrigin}/connect/authorize`,
    // SQLite file for OAuth clients/codes/tokens and MCP uploads/jobs. Same
    // directory (and Docker volume, analytics_db -> /app/data) as the
    // existing jobs.db / analytics.db, so it survives container recreation.
    dbPath: env.MCP_DB_PATH || path.join(process.cwd(), "data", "mcp.db"),
    // Exact redirect URIs (or prefix patterns ending in "*") a dynamically
    // registered client may use. ChatGPT's documented callbacks are the
    // default; MCP_OAUTH_EXTRA_REDIRECT_URIS adds test clients (e.g. the
    // MCP Inspector's http://localhost:6274/oauth/callback) — never set
    // that in production.
    redirectUriAllowlist: [
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://chatgpt.com/connector/oauth/*",
      ...list(env.MCP_OAUTH_EXTRA_REDIRECT_URIS),
    ],
    accessTokenTtlS: num(env.MCP_ACCESS_TOKEN_TTL_S, 3600),
    refreshTokenTtlS: num(env.MCP_REFRESH_TOKEN_TTL_S, 30 * 86400),
    // Absolute lifetime of one consent (grant), across refresh rotations.
    grantMaxAgeS: num(env.MCP_GRANT_MAX_AGE_S, 90 * 86400),
    authCodeTtlS: num(env.MCP_AUTH_CODE_TTL_S, 300),
    pendingRequestTtlS: num(env.MCP_PENDING_REQUEST_TTL_S, 900),
    maxRegisteredClients: num(env.MCP_MAX_REGISTERED_CLIENTS, 50_000),
    // Uploads
    uploadUrlTtlS: num(env.MCP_UPLOAD_URL_TTL_S, 30 * 60),
    // How long an uploaded file stays usable for start_mastering (re-runs
    // with other settings reuse it). Must stay below the 2h temp-file sweep
    // (middleware/cleanupUploads.js) — that sweep is the backstop.
    uploadRetentionS: Math.min(num(env.MCP_UPLOAD_RETENTION_S, 90 * 60), 110 * 60),
    maxUploadMb: num(env.MCP_MAX_UPLOAD_MB, num(env.MAX_UPLOAD_MB, 200)),
    // Mirrors the Python service's MASTERING_MAX_DURATION_MINUTES (15); the
    // Python service re-checks it regardless.
    maxDurationMinutes: num(env.MCP_MAX_DURATION_MINUTES, 15),
    maxPendingUploadsPerUser: num(env.MCP_MAX_PENDING_UPLOADS_PER_USER, 10),
    // Downloads
    downloadUrlTtlS: num(env.MCP_DOWNLOAD_URL_TTL_S, 3600),
    // Jobs
    maxConcurrentJobs: num(env.MCP_MAX_CONCURRENT_JOBS, 2),
    maxActiveJobsPerUser: num(env.MCP_MAX_ACTIVE_JOBS_PER_USER, 2),
    // A queued job that can't start within this window fails (refunded)
    // rather than outliving its reservation lease (reservationLedger.js:
    // 25 min lease - 19 min render deadline - margin).
    queueMaxWaitMs: num(env.MCP_QUEUE_MAX_WAIT_MS, 4 * 60 * 1000),
    // Per-user request budgets (per 15 min), keyed by the OAuth subject —
    // never by IP: every ChatGPT user arrives from OpenAI's egress IPs.
    rateLimits: {
      requests: num(env.MCP_RATE_REQUESTS_PER_15M, 300),
      uploads: num(env.MCP_RATE_UPLOADS_PER_15M, 30),
      masters: num(env.MCP_RATE_MASTERS_PER_15M, 20),
      // The upload page/PUT and download links are opened in the person's
      // own browser, so these are keyed by IP (not OpenAI's).
      uploadPutsPerIp: num(env.MCP_RATE_UPLOAD_PUTS_PER_IP_15M, 30),
      downloadsPerIp: num(env.MCP_RATE_DOWNLOADS_PER_IP_5M, 60),
    },
    // OpenAI plugin domain verification token, served verbatim at
    // /.well-known/openai-apps-challenge. Unset = 404.
    openaiChallengeToken: env.OPENAI_APPS_CHALLENGE_TOKEN || null,
    supportUrl: env.MCP_SUPPORT_URL || `${publicOrigin}/terms`,
  };
}

export const MCP_SCOPES = {
  read: "mastering:read",
  write: "mastering:write",
};
export const SUPPORTED_SCOPES = [MCP_SCOPES.read, MCP_SCOPES.write];

// Every format the website's /master accepts (masteringRoutes.js
// ALLOWED_UPLOAD_EXTS). The Python engine decodes the compressed ones.
export const SUPPORTED_UPLOAD_EXTS = [".wav", ".aiff", ".aif", ".flac", ".mp3", ".m4a", ".aac", ".ogg", ".wma", ".mp4", ".webm"];

export function validateMcpConfig(config, { nodeEnv }) {
  const problems = [];
  if (!config.enabled) return problems;
  if (nodeEnv === "production") {
    for (const [name, value] of [
      ["MCP_PUBLIC_ORIGIN", config.publicOrigin],
      ["MCP_OAUTH_ISSUER", config.issuer],
      ["MCP_CONSENT_URL", config.consentUrl],
    ]) {
      if (!/^https:\/\//.test(value)) problems.push(`${name} must be an https:// URL in production (got ${value}).`);
    }
    for (const uri of config.redirectUriAllowlist) {
      if (!uri.startsWith("https://")) problems.push(`Non-HTTPS redirect URI allowed in production: ${uri} (MCP_OAUTH_EXTRA_REDIRECT_URIS).`);
    }
  }
  return problems;
}
