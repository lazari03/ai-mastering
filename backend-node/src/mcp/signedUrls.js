import crypto from "node:crypto";

// Presigned-URL tokens for MCP uploads and downloads. HMAC-SHA256 with the
// existing DOWNLOAD_TOKEN_SECRET (settings.downloadTokenSecret), each under
// its own namespace prefix — so an MCP token can never verify as a website
// ?dl= token, share token or public-preview token, or vice versa, and an
// upload token can never authorize a download. Unlike the website's ?dl=
// token (any job of the user, 6 h), each of these names exactly one upload
// or one job and expires quickly.

function sign(secret, namespace, payload) {
  return crypto.createHmac("sha256", secret).update(`${namespace}:${payload}`).digest("base64url");
}

function mint(secret, namespace, fields, expMs) {
  const payload = [...fields, String(expMs)].join(".");
  return `${Buffer.from(payload).toString("base64url")}.${sign(secret, namespace, payload)}`;
}

function verify(secret, namespace, token, now) {
  if (typeof token !== "string" || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  const sig = token.slice(dot + 1);
  const expected = sign(secret, namespace, payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const parts = payload.split(".");
  const exp = Number(parts.pop());
  if (!Number.isFinite(exp) || now > exp) return null;
  return parts;
}

export function createSignedUrls({ secret, now = () => Date.now() }) {
  if (!secret) throw new Error("createSignedUrls needs a secret");
  return {
    mintUpload: (uploadId, expMs) => mint(secret, "mcp-upload", [uploadId], expMs),
    // True only for an unexpired token minted for exactly this upload.
    verifyUpload(token, uploadId) {
      const parts = verify(secret, "mcp-upload", token, now());
      return Boolean(parts && parts.length === 1 && parts[0] === uploadId);
    },
    mintDownload: (uid, jobId, expMs) => mint(secret, "mcp-download", [uid, jobId], expMs),
    // { uid } for an unexpired token minted for exactly this job, else null.
    verifyDownload(token, jobId) {
      const parts = verify(secret, "mcp-download", token, now());
      if (!parts || parts.length !== 2 || parts[1] !== jobId) return null;
      return { uid: parts[0] };
    },
  };
}
