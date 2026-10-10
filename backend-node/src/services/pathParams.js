import path from "node:path";

// Input validation for job ids and file-route parameters. Every route that
// builds an upstream Python URL or a local file path from a request value
// goes through these helpers.

const JOB_ID_RE = /^[A-Za-z0-9]{6,64}$/;
export const ALLOWED_OUTPUT_EXTS = new Set(["wav", "mp3"]);
// Keep in sync with SUPPORTED_CODECS in backend/app/services/codec_preview_service.py.
export const ALLOWED_CODECS = new Set(["mp3_128", "mp3_320", "aac_128", "aac_256", "opus_128"]);

export function isValidJobId(value) {
  return typeof value === "string" && JOB_ID_RE.test(value);
}

export function isValidExt(value) {
  return typeof value === "string" && ALLOWED_OUTPUT_EXTS.has(value);
}

export function isValidCodec(value) {
  return typeof value === "string" && ALLOWED_CODECS.has(value);
}

// Builds an upstream path from already-validated segments, each encoded.
export function upstreamPath(...segments) {
  return `/${segments.map((segment) => encodeURIComponent(String(segment))).join("/")}`;
}

// Resolves dir/name and refuses anything that would leave dir.
export function safeJoin(dir, name) {
  const base = path.resolve(dir);
  const resolved = path.resolve(base, name);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("Path escapes its directory");
  }
  return resolved;
}

// Registers router.param() guards: a malformed :jobId / :codec / :ext gets a
// 404 before any handler (ownership lookup, file access, upstream call) runs.
export function guardRouteParams(router) {
  const guard = (check) => (req, res, next, value) => (check(value) ? next() : res.status(404).json({ detail: "Not found" }));
  router.param("jobId", guard(isValidJobId));
  router.param("codec", guard(isValidCodec));
  router.param("ext", guard(isValidExt));
}
