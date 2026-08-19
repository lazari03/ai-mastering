import crypto from "node:crypto";

import { settings } from "../config/settings.js";

// The download/original/codec-preview-download routes serve real audio
// files and have to stay behind auth (ownsJob() ownership checks) — but
// they're hit by <a href download>, <audio src>, and direct browser
// navigation, none of which can attach an Authorization header the way
// fetch() calls elsewhere in this app do. requireAuth's Bearer-only check
// 401s every one of those. This is the standard fix (same idea as an S3
// presigned URL): a short-lived, uid-scoped signed token passed as a query
// param instead of a header, checked as an alternate credential — see
// server.js's auth gate.
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h — comfortably covers a session, well under the 48h file retention

function sign(payload) {
  return crypto.createHmac("sha256", settings.downloadTokenSecret).update(payload).digest("base64url");
}

export function mintDownloadToken(uid) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${uid}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyDownloadToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encodedPayload, sig] = token.split(".");
  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expectedSig = sign(payload);
  // Constant-time compare — this guards real file access, not worth a
  // timing side-channel over saving a `crypto` import.
  if (sig?.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  const [uid, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!uid || !Number.isFinite(exp) || Date.now() > exp) return null;
  return uid;
}
