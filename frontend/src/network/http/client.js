const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 12000;
const MASTERING_TIMEOUT_MS = 20 * 60 * 1000;

async function request(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Mastering backend timeout after ${Math.round(timeoutMs / 1000)}s at ${API_BASE}.`);
    }
    const reason = error?.message || "network error";
    throw new Error(`Cannot reach mastering backend at ${API_BASE}. ${reason}. Start backend-node and retry.`);
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = isJson ? payload?.detail || JSON.stringify(payload) : payload;
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return payload;
}

export async function getGenres() {
  return request("/genres");
}

export async function getTags() {
  return request("/tags");
}

export async function getStyles() {
  return request("/styles");
}

export async function getMixPresets() {
  return request("/mix-presets");
}

export async function postMaster(formData) {
  return request("/master", {
    method: "POST",
    body: formData,
  }, MASTERING_TIMEOUT_MS);
}

export async function postAnalyzeChords(formData) {
  return request("/analyze-chords", {
    method: "POST",
    body: formData,
  }, MASTERING_TIMEOUT_MS);
}

export async function postClean(formData) {
  return request("/clean", {
    method: "POST",
    body: formData,
  }, MASTERING_TIMEOUT_MS);
}

export async function postImportPreset(formData) {
  return request("/import-preset", {
    method: "POST",
    body: formData,
  });
}

export async function postCodecPreview(jobId, codec) {
  return request(
    "/codec-preview",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, codec }),
    },
    MASTERING_TIMEOUT_MS
  );
}

export function getOriginalUrl(jobId) {
  return `${API_BASE}/original/${jobId}`;
}

export function toAbsoluteUrl(path) {
  return `${API_BASE}${path}`;
}
