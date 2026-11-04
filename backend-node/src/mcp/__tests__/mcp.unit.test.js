import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sniffAudioFamily, familyMatchesExt, headerDuration, validateAudioFile } from "../audioValidation.js";
import { createSignedUrls } from "../signedUrls.js";
import { loadMcpConfig, validateMcpConfig } from "../config.js";
import { resolveScopes } from "../oauthProvider.js";
import { mapRenderFailure, summarizeResult } from "../jobRunner.js";
import { decideMasterCharge } from "../../services/masterEntitlement.js";

const head = (ascii, size = 64) => {
  const b = Buffer.alloc(size);
  b.write(ascii, 0, "latin1");
  return b;
};

test("sniffAudioFamily recognizes every supported container and nothing else", () => {
  const riff = head("RIFF\0\0\0\0WAVE");
  assert.equal(sniffAudioFamily(riff), "wav");
  assert.equal(sniffAudioFamily(head("FORM\0\0\0\0AIFF")), "aiff");
  assert.equal(sniffAudioFamily(head("fLaC")), "flac");
  assert.equal(sniffAudioFamily(head("OggS")), "ogg");
  assert.equal(sniffAudioFamily(head("\0\0\0\x20ftypM4A ")), "mp4");
  assert.equal(sniffAudioFamily(head("ID3\x04")), "id3");
  assert.equal(sniffAudioFamily(Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Buffer.alloc(60)])), "mp3");
  assert.equal(sniffAudioFamily(Buffer.from([0xff, 0xf1, 0x50, 0x80, ...Buffer.alloc(60)])), "aac");
  assert.equal(sniffAudioFamily(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.alloc(60)])), "webm");
  assert.equal(sniffAudioFamily(Buffer.concat([Buffer.from("3026b2758e66cf11a6d900aa0062ce6c", "hex"), Buffer.alloc(48)])), "asf");
  assert.equal(sniffAudioFamily(head("MZ\x90\0")), null, "executables are not audio");
  assert.equal(sniffAudioFamily(head("<!doctype html>")), null);
  assert.equal(sniffAudioFamily(head("%PDF-1.7")), null);
  assert.equal(familyMatchesExt("wav", ".wav"), true);
  assert.equal(familyMatchesExt("flac", ".wav"), false);
  assert.equal(familyMatchesExt("id3", ".mp3"), true);
  assert.equal(familyMatchesExt("mp4", ".m4a"), true);
  assert.equal(familyMatchesExt("wav", ".exe"), false);
});

test("header durations: FLAC STREAMINFO and AIFF COMM are read without decoding", () => {
  const flac = Buffer.alloc(8 + 34);
  flac.write("fLaC", 0);
  flac[4] = 0x80; // last block, type 0 STREAMINFO
  const sr = 48000;
  const samples = 48000 * 90; // 90 s
  flac[8 + 10] = (sr >> 12) & 0xff;
  flac[8 + 11] = (sr >> 4) & 0xff;
  flac[8 + 12] = ((sr & 0x0f) << 4) | 0x02;
  flac[8 + 13] = 0x00;
  flac.writeUInt32BE(samples, 8 + 14);
  assert.equal(headerDuration("flac", flac), 90);

  const aiff = Buffer.alloc(12 + 26);
  aiff.write("FORM", 0);
  aiff.write("AIFF", 8);
  aiff.write("COMM", 12);
  aiff.writeUInt32BE(18, 16);
  aiff.writeUInt16BE(2, 20);
  aiff.writeUInt32BE(44100 * 30, 22); // frames
  aiff.writeUInt16BE(16, 26);
  // 44100 as 80-bit extended: exponent 16383+15, mantissa 44100 << 48
  aiff.writeUInt16BE(16383 + 15, 28);
  aiff.writeUInt32BE(44100 * 2 ** 16, 30);
  aiff.writeUInt32BE(0, 34);
  assert.equal(Math.round(headerDuration("aiff", aiff)), 30);
});

test("validateAudioFile: too short, unknown duration falls back to the probe", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-audio-"));
  try {
    const file = path.join(dir, "a.mp3");
    fs.writeFileSync(file, Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Buffer.alloc(200)]));
    const probed = await validateAudioFile(file, ".mp3", { maxDurationMinutes: 15, probe: async () => 16 * 60 });
    assert.equal(probed.code, "too_long");
    const unknown = await validateAudioFile(file, ".mp3", { maxDurationMinutes: 15, probe: async () => null });
    assert.equal(unknown.ok, true, "unknown duration is left to the Python engine's own check");
    const short = await validateAudioFile(file, ".mp3", { maxDurationMinutes: 15, probe: async () => 0.2 });
    assert.equal(short.code, "too_short");
    const empty = path.join(dir, "e.wav");
    fs.writeFileSync(empty, "");
    assert.equal((await validateAudioFile(empty, ".wav", {})).code, "empty_file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("signed URLs: bound to one upload/job, namespaced, expiring", () => {
  let t = 1_000_000;
  const s = createSignedUrls({ secret: "k", now: () => t });
  const up = s.mintUpload("a".repeat(32), t + 1000);
  assert.equal(s.verifyUpload(up, "a".repeat(32)), true);
  assert.equal(s.verifyUpload(up, "b".repeat(32)), false);
  assert.equal(s.verifyDownload(up, "a".repeat(32)), null, "an upload token is never a download token");
  const dl = s.mintDownload("uid1", "job1", t + 1000);
  assert.deepEqual(s.verifyDownload(dl, "job1"), { uid: "uid1" });
  assert.equal(s.verifyDownload(dl, "job2"), null);
  assert.equal(createSignedUrls({ secret: "other", now: () => t }).verifyDownload(dl, "job1"), null);
  t += 2000;
  assert.equal(s.verifyDownload(dl, "job1"), null, "expired");
  assert.equal(s.verifyUpload("garbage", "a"), false);
  assert.equal(s.verifyUpload("x".repeat(5000), "a"), false);
});

test("decideMasterCharge mirrors the website's /master plan rules", () => {
  const snap = (remaining, extra = 0) => ({ masterQuota: { remaining, limit: 3, used: 3 - remaining }, extraCredits: extra, stemQuota: { remaining: 0, limit: 20 }, extraStemCredits: 0 });
  assert.deepEqual(decideMasterCharge({ plan: "free", snapshot: snap(2) }).needs, { master: "quota", stem: null });
  assert.deepEqual(decideMasterCharge({ plan: "free", snapshot: snap(0, 1) }).needs, { master: "credit", stem: null });
  assert.equal(decideMasterCharge({ plan: "free", snapshot: snap(0) }).code, "quota_exhausted");
  assert.equal(decideMasterCharge({ plan: "free", snapshot: null }).code, "quota_exhausted", "fails closed");
  assert.equal(decideMasterCharge({ plan: "indie", snapshot: snap(5), tier: "professional" }).code, "plan_required");
  assert.equal(decideMasterCharge({ plan: "studio", snapshot: snap(5), tier: "professional" }).ok, true);
  assert.equal(decideMasterCharge({ plan: "studio", snapshot: snap(5), useStemSeparation: true }).code, "stem_not_included");
  assert.match(decideMasterCharge({ plan: "indie", snapshot: snap(0) }).detail, /Upgrade to Studio/);
});

test("config: off by default; production refuses http URLs and non-https redirect allowlist entries", () => {
  assert.equal(loadMcpConfig({}).enabled, false);
  const c = loadMcpConfig({ MCP_ENABLED: "true" });
  assert.equal(c.resourceUrl, "https://auralithforge.app/mcp");
  assert.equal(c.issuer, "https://api.auralithforge.app");
  assert.deepEqual(validateMcpConfig(c, { nodeEnv: "production" }), []);
  const bad = loadMcpConfig({ MCP_ENABLED: "true", MCP_PUBLIC_ORIGIN: "http://x", MCP_OAUTH_EXTRA_REDIRECT_URIS: "http://localhost:6274/oauth/callback" });
  assert.equal(validateMcpConfig(bad, { nodeEnv: "production" }).length >= 2, true);
  assert.ok(c.uploadRetentionS * 1000 < 2 * 60 * 60 * 1000, "uploads expire before the 2h temp-file sweep");
});

test("scopes: unknown scopes are ignored, empty means the default set", () => {
  assert.deepEqual(resolveScopes(["openid", "email"]), ["mastering:read", "mastering:write"]);
  assert.deepEqual(resolveScopes(["mastering:read", "openid"]), ["mastering:read"]);
  assert.deepEqual(resolveScopes(undefined), ["mastering:read", "mastering:write"]);
});

test("mapRenderFailure: stable codes, user text for 4xx, generic text for 5xx", () => {
  assert.deepEqual(mapRenderFailure(Object.assign(new Error('Mastering failed: "Too long"'), { status: 413, code: "too_long" })), { code: "too_long", message: "Too long", retryable: false });
  const crash = mapRenderFailure(Object.assign(new Error('Mastering failed: "Traceback: File x.py"'), { status: 500 }));
  assert.equal(crash.code, "render_failed");
  assert.equal(crash.retryable, true);
  assert.doesNotMatch(crash.message, /Traceback/);
  assert.equal(mapRenderFailure(Object.assign(new Error("x"), { status: 504, code: "processing_timeout" })).code, "processing_timeout");
  assert.equal(mapRenderFailure(new Error("socket hang up")).code, "render_failed");
});

test("summarizeResult tolerates a sparse engine payload", () => {
  const s = summarizeResult({ after_lufs: -10 });
  assert.equal(s.integrated_lufs, -10);
  assert.equal(s.true_peak_dbtp, null);
  assert.equal(s.output_format, "wav");
  assert.deepEqual(s.warnings, []);
});
