import net from "node:net";
import geoip from "geoip-lite";

// ---------------------------------------------------------------------
// The real visitor behind Cloudflare.
//
// Production DNS for auralithforge.app / api.auralithforge.app is proxied
// through Cloudflare (both resolve to 2606:4700::/32), so the chain is
// browser -> Cloudflare edge -> Caddy -> this server. Caddy doesn't trust
// Cloudflare, so the X-Forwarded-For it hands Express holds the *edge*
// address, and req.ip is a Cloudflare IP. Consequences before this file:
// every analytics session geolocated to wherever that edge range is
// registered (mostly "US" — an Albanian visitor showed up as the United
// States), and every IP-keyed rate limit bucketed unrelated visitors that
// happened to share an edge together.
//
// Cloudflare adds CF-Connecting-IP (the visitor's address) and
// CF-IPCountry (its own geolocation, free on every plan) to each request.
// Those headers are only trusted when the connection really came from a
// Cloudflare range — a request that reaches the origin directly could set
// them to anything.
//
// Ranges: https://www.cloudflare.com/ips/ (stable for years; if Cloudflare
// ever adds one, requests from it just fall back to the edge IP, which is
// the old behaviour — never a spoofing hole).
// ---------------------------------------------------------------------
const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

const cloudflare = new net.BlockList();
for (const cidr of CLOUDFLARE_V4) {
  const [addr, prefix] = cidr.split("/");
  cloudflare.addSubnet(addr, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_V6) {
  const [addr, prefix] = cidr.split("/");
  cloudflare.addSubnet(addr, Number(prefix), "ipv6");
}

function normalizeIp(ip) {
  if (typeof ip !== "string") return "";
  const trimmed = ip.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

export function isCloudflareIp(ip) {
  const normalized = normalizeIp(ip);
  const family = net.isIP(normalized);
  if (!family) return false;
  return cloudflare.check(normalized, family === 6 ? "ipv6" : "ipv4");
}

// CF-IPCountry is ISO 3166-1 alpha-2, plus "XX" (unknown) and "T1" (Tor).
function cleanCountry(value) {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]$/.test(upper) || upper === "XX" || upper === "T1") return null;
  return upper;
}

function lookupCountry(ip) {
  try {
    return geoip.lookup(ip)?.country || null;
  } catch {
    return null;
  }
}

/** { ip, country, viaCloudflare } for this request, computed once. */
export function resolveClient(req) {
  if (req._client) return req._client;
  const peer = normalizeIp(req.ip);
  let ip = peer;
  let country = null;
  let viaCloudflare = false;

  if (isCloudflareIp(peer)) {
    viaCloudflare = true;
    const forwarded = normalizeIp(req.headers["cf-connecting-ip"]);
    if (net.isIP(forwarded)) ip = forwarded;
    country = cleanCountry(req.headers["cf-ipcountry"]);
  }
  // Cloudflare's own country when it sent one; otherwise the offline DB on
  // the real visitor IP (never on a Cloudflare edge address).
  if (!country && ip && !isCloudflareIp(ip)) country = lookupCountry(ip);

  req._client = { ip, country, viaCloudflare };
  return req._client;
}

// Express middleware: req.clientIp / req.clientCountry for everything
// downstream (rate limiting, analytics).
export function clientIp(req, res, next) {
  const client = resolveClient(req);
  req.clientIp = client.ip || req.ip;
  req.clientCountry = client.country;
  next();
}
