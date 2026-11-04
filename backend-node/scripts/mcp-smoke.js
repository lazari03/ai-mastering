#!/usr/bin/env node
// MCP connectivity test for the Auralith Forge ChatGPT integration.
//
//   node scripts/mcp-smoke.js [--url https://auralithforge.app/mcp]
//       Read-only discovery checks, safe against production:
//       protected-resource metadata, authorization-server metadata (PKCE
//       S256, DCR, refresh), and the 401 + WWW-Authenticate challenge on /mcp.
//
//   MCP_ACCESS_TOKEN=afm_at_… node scripts/mcp-smoke.js --url …
//       Also connects with that token: initialize, tools/list, get_account.
//
//   node scripts/mcp-smoke.js --url http://localhost:8000/mcp --login
//       Full OAuth like ChatGPT does it (DCR → browser consent → PKCE token
//       exchange) using a loopback callback, then the tool calls above. Needs
//       the server started with
//       MCP_OAUTH_EXTRA_REDIRECT_URIS=http://127.0.0.1:8977/callback
//       — a local/staging setting only; production allows ChatGPT's
//       callbacks exclusively.
//
// Exit code 0 = all checks passed.
import http from "node:http";
import crypto from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const mcpUrl = new URL(opt("--url", "https://auralithforge.app/mcp"));
const CALLBACK_PORT = Number(opt("--callback-port", 8977));
let failures = 0;

function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
  return condition;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, body };
}

async function discovery() {
  const prmUrl = new URL(`/.well-known/oauth-protected-resource${mcpUrl.pathname}`, mcpUrl);
  const prm = await getJson(prmUrl);
  check("protected-resource metadata", prm.status === 200 && prm.body?.resource, `${prmUrl} → ${prm.status}`);
  check("PRM resource is the MCP URL", prm.body?.resource?.replace(/\/$/, "") === mcpUrl.href.replace(/\/$/, ""), prm.body?.resource);
  const issuer = prm.body?.authorization_servers?.[0];
  check("PRM names an authorization server", Boolean(issuer), issuer);
  if (!issuer) return null;

  const asUrl = new URL("/.well-known/oauth-authorization-server", issuer);
  const as = await getJson(asUrl);
  check("authorization-server metadata", as.status === 200, `${asUrl} → ${as.status}`);
  check("issuer matches PRM", as.body?.issuer === issuer, `${as.body?.issuer} vs ${issuer}`);
  check("PKCE S256 supported", as.body?.code_challenge_methods_supported?.includes("S256"));
  check("dynamic client registration offered", Boolean(as.body?.registration_endpoint));
  check("refresh_token grant supported", as.body?.grant_types_supported?.includes("refresh_token"));

  const unauth = await fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const challenge = unauth.headers.get("www-authenticate") || "";
  check("unauthenticated /mcp → 401", unauth.status === 401, String(unauth.status));
  check("WWW-Authenticate carries resource_metadata", /resource_metadata="[^"]+"/.test(challenge), challenge);
  return as.body;
}

async function login(as) {
  const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
  const reg = await fetch(as.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Auralith MCP smoke test", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
  });
  const client = await reg.json();
  if (!check("dynamic client registration", reg.status === 201, client.error_description || client.client_id)) return null;

  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(8).toString("hex");
  const authUrl = new URL(as.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state, resource: mcpUrl.href })) authUrl.searchParams.set(k, v);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.pathname !== "/callback") return res.end();
      res.end("You can close this tab and return to the terminal.");
      server.close();
      if (u.searchParams.get("state") !== state) return reject(new Error("state mismatch"));
      if (u.searchParams.get("error")) return reject(new Error(u.searchParams.get("error_description") || u.searchParams.get("error")));
      resolve(u.searchParams.get("code"));
    });
    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      console.log(`\nOpen this URL in a browser, sign in to Auralith Forge and approve:\n\n  ${authUrl.href}\n`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("timed out waiting for the OAuth callback"));
    }, 5 * 60 * 1000).unref();
  });

  const tokenRes = await fetch(as.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: redirectUri, resource: mcpUrl.href }),
  });
  const tokens = await tokenRes.json();
  check("token exchange (PKCE)", tokenRes.status === 200 && Boolean(tokens.access_token), tokens.error_description || "");
  return tokens.access_token || null;
}

async function toolCalls(accessToken) {
  const client = new Client({ name: "auralith-mcp-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } });
  await client.connect(transport);
  check("MCP initialize", true, `${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check("tools/list has the five tools", ["create_upload", "get_account", "get_job_status", "get_master_result", "start_mastering"].every((n) => names.includes(n)), names.join(", "));
  const acct = await client.callTool({ name: "get_account", arguments: {} });
  check("get_account", !acct.isError, acct.isError ? JSON.stringify(acct.structuredContent) : `${acct.structuredContent.account.plan_name}, ${acct.structuredContent.masters.remaining} masters left`);
  await client.close();
}

try {
  console.log(`MCP endpoint: ${mcpUrl.href}\n`);
  const as = await discovery();
  let token = process.env.MCP_ACCESS_TOKEN || null;
  if (!token && flag("--login") && as) token = await login(as);
  if (token) await toolCalls(token);
  else console.log("\n(skipped tool calls: set MCP_ACCESS_TOKEN or use --login)");
} catch (error) {
  check("smoke test ran to completion", false, error.message);
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
