import test from "node:test";
import assert from "node:assert/strict";

import { resolveClient, isCloudflareIp } from "../clientIp.js";

const req = (ip, headers = {}) => ({ ip, headers });

test("recognises Cloudflare edge addresses (v4, v6, v4-mapped)", () => {
  assert.equal(isCloudflareIp("172.70.1.1"), true);
  assert.equal(isCloudflareIp("::ffff:162.158.1.1"), true);
  assert.equal(isCloudflareIp("2606:4700::1"), true);
  assert.equal(isCloudflareIp("79.106.1.1"), false);
  assert.equal(isCloudflareIp("not-an-ip"), false);
});

test("behind Cloudflare: uses CF-Connecting-IP and CF-IPCountry", () => {
  const c = resolveClient(req("172.70.1.1", { "cf-connecting-ip": "79.106.1.1", "cf-ipcountry": "AL" }));
  assert.deepEqual(c, { ip: "79.106.1.1", country: "AL", viaCloudflare: true });
});

test("behind Cloudflare without a country header: geolocates the visitor, never the edge", () => {
  const c = resolveClient(req("172.70.1.1", { "cf-connecting-ip": "46.99.10.10" }));
  assert.equal(c.ip, "46.99.10.10");
  assert.equal(c.country, "AL");
});

test("unknown and Tor country codes are dropped", () => {
  assert.equal(resolveClient(req("172.70.1.1", { "cf-connecting-ip": "10.0.0.1", "cf-ipcountry": "XX" })).country, null);
  assert.equal(resolveClient(req("172.70.1.1", { "cf-connecting-ip": "10.0.0.1", "cf-ipcountry": "T1" })).country, null);
});

test("direct-to-origin requests can't spoof Cloudflare headers", () => {
  const c = resolveClient(req("79.106.1.1", { "cf-connecting-ip": "1.2.3.4", "cf-ipcountry": "US" }));
  assert.deepEqual(c, { ip: "79.106.1.1", country: "AL", viaCloudflare: false });
});

test("an edge IP never geolocates as the visitor's country", () => {
  const c = resolveClient(req("172.70.1.1", {}));
  assert.equal(c.country, null);
});
