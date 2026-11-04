import crypto from "node:crypto";

import {
  AccessDeniedError,
  InvalidClientError,
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidTargetError,
  InvalidTokenError,
  ServerError,
  TemporarilyUnavailableError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";

import { SUPPORTED_SCOPES } from "./config.js";
import { randomId, randomToken, sha256 } from "./store.js";

// OAuth 2.1 authorization server for the MCP integration, plugged into the
// official MCP SDK's auth router (mcpAuthRouter). The SDK owns the
// protocol surface — request parsing, redirect_uri matching, PKCE S256
// verification of the code_verifier, DCR request validation, RFC 8414
// metadata — and this provider owns state and policy:
//
//   * Identity: there is no second login. /authorize parks the validated
//     request and sends the browser to the frontend consent page, where the
//     person signs in with their existing Auralith (Firebase) account; the
//     page then calls approve()/deny() through an endpoint guarded by the
//     same requireAuth middleware as the rest of the API (consentRoutes.js).
//   * Audience: every code and token is bound to the MCP resource
//     (RFC 8707). A request naming any other resource is refused.
//   * Redirects: dynamically registered clients may only use allowlisted
//     redirect URIs (ChatGPT's documented callbacks by default), so a code
//     can never be delivered to an arbitrary site.
//   * Tokens: opaque random strings, stored hashed. Access tokens are
//     short-lived; refresh tokens rotate on every use, and presenting an
//     already-rotated refresh token revokes the whole grant (reuse
//     detection, OAuth 2.1 §4.3.1 / BCP 9700).
//   * Liveness: on every refresh the Firebase account is re-checked
//     (disabled, deleted, or sessions revoked after the grant was made →
//     grant revoked), so "sign out everywhere", an admin disable or account
//     deletion reaches ChatGPT within one access-token lifetime.

export const ACCESS_PREFIX = "afm_at_";
export const REFRESH_PREFIX = "afm_rt_";
const CODE_PREFIX = "afm_ac_";

function matchesAllowlist(uri, allowlist) {
  return allowlist.some((pattern) => (pattern.endsWith("*") ? uri.startsWith(pattern.slice(0, -1)) && uri.length > pattern.length - 1 : uri === pattern));
}

function sameResource(a, b) {
  const norm = (v) => String(v).replace(/#.*$/, "").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

// Requested scopes ∩ supported. An empty or entirely-unknown request gets
// the full default set (the only two scopes there are), not an error: some
// clients send OIDC scopes (openid, email) that this server doesn't
// advertise, and refusing them would just break the connection.
export function resolveScopes(requested) {
  const wanted = (requested || []).filter((s) => SUPPORTED_SCOPES.includes(s));
  return wanted.length ? [...new Set(wanted)] : [...SUPPORTED_SCOPES];
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createOAuthProvider({ store, config, checkUser = async () => ({ ok: true }), now = () => Date.now(), log = console }) {
  const resource = config.resourceUrl;

  function assertResource(requested) {
    if (requested && !sameResource(requested, resource)) {
      throw new InvalidTargetError(`This authorization server only issues tokens for ${resource}.`);
    }
  }

  const clientsStore = {
    getClient(clientId) {
      const client = store.getClient(clientId);
      if (!client) return undefined;
      // The SDK's client authentication compares client_secret in plain
      // text; it only ever sees the hash-check result through this shape:
      // secret-bearing clients are authenticated in tokenGuard() below
      // (constant time, against a hash) before the SDK runs, and the SDK
      // gets the client without a secret.
      const { _secret_hash: _ignored, ...rest } = client;
      return rest;
    },
    registerClient(client) {
      const redirectUris = client.redirect_uris || [];
      if (!redirectUris.length) throw new InvalidClientMetadataError("redirect_uris is required.");
      for (const uri of redirectUris) {
        if (!matchesAllowlist(uri, config.redirectUriAllowlist)) {
          throw new InvalidClientMetadataError(`redirect_uri not allowed: ${uri}`);
        }
      }
      const grantTypes = client.grant_types || ["authorization_code", "refresh_token"];
      if (grantTypes.some((g) => !["authorization_code", "refresh_token"].includes(g))) {
        throw new InvalidClientMetadataError("Only authorization_code and refresh_token grants are supported.");
      }
      const authMethod = client.token_endpoint_auth_method || "client_secret_post";
      if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
        throw new InvalidClientMetadataError(`token_endpoint_auth_method ${authMethod} is not supported.`);
      }
      if (store.countClients() >= config.maxRegisteredClients) {
        log.error?.("MCP OAuth: registered-client ceiling reached; refusing registration.");
        throw new ServerError("Client registration is temporarily unavailable.");
      }
      const clientId = `afc_${randomId(16)}`;
      const secret = client.client_secret || null;
      const record = {
        ...client,
        // Free-text metadata is shown on the consent page; keep it short.
        client_name: client.client_name ? String(client.client_name).slice(0, 80) : undefined,
        grant_types: grantTypes,
        token_endpoint_auth_method: authMethod,
        client_id: clientId,
        client_id_issued_at: Math.floor(now() / 1000),
        // RFC 7591: 0 = never expires. A connection must not silently break
        // 30 days in (the SDK's default); revocation is per grant instead.
        ...(secret ? { client_secret_expires_at: 0 } : {}),
      };
      delete record.client_secret;
      store.insertClient(record, secret ? sha256(secret) : null);
      // The plaintext secret is returned exactly once, in the DCR response.
      return secret ? { ...record, client_secret: secret } : record;
    },
  };

  function issueTokens(grant, { refreshExpiresAt } = {}) {
    const t = now();
    const accessToken = randomToken(ACCESS_PREFIX);
    const refreshToken = randomToken(REFRESH_PREFIX);
    const accessExpires = Math.min(t + config.accessTokenTtlS * 1000, grant.expires_at);
    const refreshExpires = Math.min(refreshExpiresAt ?? t + config.refreshTokenTtlS * 1000, grant.expires_at);
    store.insertToken(sha256(accessToken), "access", grant.grant_id, accessExpires);
    store.insertToken(sha256(refreshToken), "refresh", grant.grant_id, refreshExpires);
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.max(1, Math.floor((accessExpires - t) / 1000)),
      refresh_token: refreshToken,
      scope: (Array.isArray(grant.scopes) ? grant.scopes : JSON.parse(grant.scopes)).join(" "),
    };
  }

  const provider = {
    clientsStore,

    // Called by the SDK's authorization handler once client_id,
    // redirect_uri, response_type=code and code_challenge_method=S256 are
    // validated. Park the request; the consent page finishes it.
    async authorize(client, params, res) {
      assertResource(params.resource?.href);
      const requestId = randomId(24);
      const t = now();
      store.insertPending({
        request_id: requestId,
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        state: params.state ?? null,
        scopes: JSON.stringify(resolveScopes(params.scopes)),
        resource,
        created_at: t,
        expires_at: t + config.pendingRequestTtlS * 1000,
      });
      store.touchClient(client.client_id);
      const target = new URL(config.consentUrl);
      target.searchParams.set("request", requestId);
      res.redirect(302, target.href);
    },

    async challengeForAuthorizationCode(client, code) {
      const row = store.getCode(sha256(code));
      if (!row || row.client_id !== client.client_id) throw new InvalidGrantError("Invalid authorization code.");
      return row.code_challenge;
    },

    async exchangeAuthorizationCode(client, code, _codeVerifier, redirectUri, requestedResource) {
      // PKCE was already verified by the SDK against challengeForAuthorizationCode().
      const consumed = store.consumeCode(sha256(code));
      if (consumed.status === "reused") {
        // A replayed code is a sign of interception: kill anything it minted.
        for (const g of store.db.prepare("SELECT grant_id FROM oauth_grants WHERE uid = ? AND client_id = ? AND created_at >= ?").all(consumed.row.uid, consumed.row.client_id, consumed.row.expires_at - config.authCodeTtlS * 1000)) {
          store.revokeGrant(g.grant_id, "authorization_code_replay");
        }
        throw new InvalidGrantError("Authorization code already used.");
      }
      if (consumed.status !== "ok") throw new InvalidGrantError("Invalid or expired authorization code.");
      const row = consumed.row;
      if (row.client_id !== client.client_id) throw new InvalidGrantError("Authorization code was issued to another client.");
      if (redirectUri !== undefined && redirectUri !== row.redirect_uri) throw new InvalidGrantError("redirect_uri does not match the authorization request.");
      assertResource(requestedResource?.href);
      const t = now();
      const grant = {
        grant_id: `afg_${randomId(16)}`,
        uid: row.uid,
        email: row.email,
        client_id: row.client_id,
        scopes: JSON.stringify(row.scopes),
        resource: row.resource,
        created_at: t,
        expires_at: t + config.grantMaxAgeS * 1000,
      };
      store.insertGrant(grant);
      return issueTokens(grant);
    },

    async exchangeRefreshToken(client, refreshToken, scopes, requestedResource) {
      const hash = sha256(refreshToken);
      const row = store.getToken(hash);
      if (!row || row.kind !== "refresh") throw new InvalidGrantError("Invalid refresh token.");
      if (row.client_id !== client.client_id) throw new InvalidGrantError("Refresh token was issued to another client.");
      if (row.revoked_at) throw new InvalidGrantError("This connection was revoked. Reconnect Auralith Forge.");
      if (row.expires_at < now() || row.grant_expires_at < now()) throw new InvalidGrantError("Refresh token expired. Reconnect Auralith Forge.");
      if (!store.useToken(hash)) {
        store.revokeGrant(row.grant_id, "refresh_token_reuse");
        log.warn?.(`MCP OAuth: refresh token reuse on grant ${row.grant_id} — grant revoked.`);
        throw new InvalidGrantError("Refresh token already used. Reconnect Auralith Forge.");
      }
      assertResource(requestedResource?.href);
      const granted = row.scopes;
      if (scopes?.length && scopes.some((s) => !granted.includes(s))) {
        throw new InvalidGrantError("Requested scope exceeds the original grant.");
      }
      let liveness;
      try {
        liveness = await checkUser(row.uid, row.grant_created_at);
      } catch (error) {
        log.error?.("MCP OAuth: account check failed during refresh:", error.message);
        throw new TemporarilyUnavailableError("Account verification is temporarily unavailable. Try again shortly.");
      }
      if (!liveness?.ok) {
        store.revokeGrant(row.grant_id, liveness?.reason || "account_inactive");
        throw new InvalidGrantError("This Auralith Forge account can no longer be used here. Sign in again.");
      }
      const grant = store.getGrant(row.grant_id);
      const narrowed = scopes?.length ? { ...grant, scopes: JSON.stringify(scopes) } : grant;
      return issueTokens(narrowed);
    },

    async verifyAccessToken(token) {
      if (typeof token !== "string" || !token.startsWith(ACCESS_PREFIX)) throw new InvalidTokenError("Invalid access token.");
      const row = store.getToken(sha256(token));
      if (!row || row.kind !== "access") throw new InvalidTokenError("Invalid access token.");
      if (row.revoked_at) throw new InvalidTokenError("Access token revoked.");
      if (row.expires_at < now() || row.grant_expires_at < now()) throw new InvalidTokenError("Access token expired.");
      return {
        token,
        clientId: row.client_id,
        scopes: row.scopes,
        expiresAt: Math.floor(row.expires_at / 1000),
        resource: new URL(row.resource),
        extra: { uid: row.uid, email: row.email || null, grantId: row.grant_id },
      };
    },

    async revokeToken(client, request) {
      const row = store.getToken(sha256(request.token));
      // RFC 7009: unknown tokens are not an error; only the owning client may revoke.
      if (!row || row.client_id !== client.client_id) return;
      store.revokeGrant(row.grant_id, "revoked_by_client");
    },
  };

  // ---- Consent (called by consentRoutes.js after Firebase requireAuth) ---

  function describePending(requestId) {
    const pending = store.getPending(requestId);
    if (!pending) return null;
    const client = store.getClient(pending.client_id);
    if (!client) return null;
    return {
      request_id: pending.request_id,
      client_name: client.client_name || "An MCP client",
      client_uri: client.client_uri || null,
      redirect_host: new URL(pending.redirect_uri).host,
      scopes: pending.scopes,
      resource: pending.resource,
      expires_at: new Date(pending.expires_at).toISOString(),
    };
  }

  function redirectWith(pending, params) {
    const url = new URL(pending.redirect_uri);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    if (pending.state != null) url.searchParams.set("state", pending.state);
    // RFC 9207 issuer identification on every response we build ourselves —
    // byte-identical to the metadata's `issuer` (the SDK publishes URL.href,
    // trailing slash included), since clients compare them exactly.
    url.searchParams.set("iss", new URL(config.issuer).href);
    return url.href;
  }

  function approve(requestId, { uid, email }) {
    if (!uid) throw new AccessDeniedError("Sign in required.");
    const pending = store.takePending(requestId);
    if (!pending) throw new InvalidRequestError("This authorization request has expired. Start the connection again from ChatGPT.");
    if (!store.getClient(pending.client_id)) throw new InvalidClientError("Unknown client.");
    const code = randomToken(CODE_PREFIX);
    store.insertCode({
      code_hash: sha256(code),
      client_id: pending.client_id,
      uid,
      email: email || null,
      redirect_uri: pending.redirect_uri,
      code_challenge: pending.code_challenge,
      scopes: JSON.stringify(pending.scopes),
      resource: pending.resource,
      expires_at: now() + config.authCodeTtlS * 1000,
    });
    return { redirect_url: redirectWith(pending, { code }) };
  }

  function deny(requestId) {
    const pending = store.takePending(requestId);
    if (!pending) throw new InvalidRequestError("This authorization request has expired.");
    return { redirect_url: redirectWith(pending, { error: "access_denied", error_description: "The user declined to connect Auralith Forge." }) };
  }

  // Express middleware for /token and /revoke, mounted BEFORE the SDK's
  // handlers: authenticates confidential clients in constant time against
  // the stored hash (client_secret_post and client_secret_basic), then
  // rewrites the body so the SDK — which compares plaintext secrets — sees
  // an already-authenticated public-shaped request.
  function tokenGuard(req, res, next) {
    let clientId = req.body?.client_id;
    let secret = req.body?.client_secret;
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization || "");
    if (basic) {
      const decoded = Buffer.from(basic[1], "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx > 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        secret = decodeURIComponent(decoded.slice(idx + 1));
      }
    }
    if (!clientId) return next();
    const client = store.getClient(clientId);
    if (client?._secret_hash) {
      if (!secret || !constantTimeEqualHex(sha256(secret), client._secret_hash)) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(401).json({ error: "invalid_client", error_description: "Client authentication failed." });
      }
    }
    req.body = { ...(req.body || {}), client_id: clientId };
    delete req.body.client_secret;
    return next();
  }

  return { provider, describePending, approve, deny, tokenGuard };
}
