import { getFirebaseAuth } from "@/lib/firebase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 12000;
const MASTERING_TIMEOUT_MS = 20 * 60 * 1000;

// Every route on the backend except /health requires a Firebase ID token —
// attach it here, once, so none of the individual endpoint functions below
// need to know auth exists. getIdToken() returns the cached token and only
// hits the network to refresh it if it's actually expired/near-expiry —
// forceRefresh bypasses that cache, for the retry-on-401 below.
async function authHeader(forceRefresh = false) {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) return {};
  const token = await user.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

async function doFetch(path, options, timeoutMs, forceRefresh) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...(options.headers || {}), ...(await authHeader(forceRefresh)) };
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
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
}

async function request(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  let response = await doFetch(path, options, timeoutMs, false);

  // A signed-in user getting 401 almost always means the cached ID token
  // was stale/not-yet-valid the instant it was fetched, not that they're
  // actually logged out — this genuinely happens in the first moment
  // after sign-up (confirmed: reproduced once in testing, gone on retry).
  // One retry with a force-refreshed token, only when we actually have a
  // user to refresh for, covers it without masking a real "not logged in".
  if (response.status === 401 && getFirebaseAuth()?.currentUser) {
    response = await doFetch(path, options, timeoutMs, true);
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    // The token refresh above only helps a stale-but-still-valid token —
    // it can't fix a session the backend has actually invalidated (past
    // the absolute age cap, or revoked by "sign out of all devices"; see
    // requireAuth.js). That's a real logout, not a transient error: clear
    // the stale local Firebase session and send the user back to /login
    // instead of leaving them stuck re-hitting the same 401 forever.
    if (response.status === 401 && isJson && payload?.code === "SESSION_EXPIRED") {
      getFirebaseAuth()
        ?.signOut()
        .finally(() => {
          if (typeof window !== "undefined") {
            window.location.href = "/login?reason=session_expired";
          }
        });
    }
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

export async function getCategories() {
  return request("/categories");
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

export async function postImportPreset(formData) {
  return request("/import-preset", {
    method: "POST",
    body: formData,
  });
}

export async function deleteCustomPreset(name) {
  return request(`/custom-presets/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Called before account creation — no auth exists yet, and authHeader()
// above already handles that gracefully (no current user -> no header).
export async function checkEmailDeliverable(email) {
  return request("/validate-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function postProfile(profile) {
  return request("/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export async function getProfile() {
  return request("/profile");
}

export async function getJobs() {
  return request("/jobs");
}

// Backs the dedicated result page (/app/masters/:jobId) — full detail for
// one job (analysis/processing data, not just the list-view summary
// getJobs() returns), scoped server-side to the caller's own jobs. Used
// both right after a fresh render and when reopening an older still-valid
// one from My Masters — same fetch either way.
export async function getJobDetail(jobId) {
  return request(`/jobs/${jobId}`);
}

export async function deleteJobRecord(jobId) {
  return request(`/jobs/${jobId}`, { method: "DELETE" });
}

export async function postShareJob(jobId) {
  return request(`/jobs/${jobId}/share`, { method: "POST" });
}

// Public — no signed-in user needed (or expected). Backs the simple
// /shared/[jobId] page a share link points recipients at.
export async function getSharedJobInfo(jobId, token) {
  return request(`/shared/${jobId}/info?token=${encodeURIComponent(token)}`);
}

export async function deleteAccountData() {
  return request("/account", { method: "DELETE" });
}

export async function postSignOutEverywhere() {
  return request("/account/sign-out-everywhere", { method: "POST" });
}

export async function getBillingStatus() {
  return request("/billing/status");
}

export async function getEntitlements() {
  return request("/billing/entitlements");
}

// item: "subscription" | "master_standard" | "master_professional" | "chords" | "stem_addon"
export async function postCheckout(item, successUrl) {
  return request("/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item, success_url: successUrl }),
  });
}

// Used instead of postCheckout when the user already has an active paid
// subscription (see BillingPanel.jsx) — modifies that subscription in
// place rather than starting a second, independent checkout.
export async function postChangePlan(item) {
  return request("/billing/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  });
}

export async function postBillingPortal() {
  return request("/billing/portal", { method: "POST" });
}

// Public — works for a signed-out visitor too (see server.js's auth
// gate), so this deliberately doesn't rely on authHeader() finding a
// user. source is just a free-text tag ("footer", "newsletter-page") for
// telling signup channels apart later.
export async function postNewsletterSubscribe(email, source) {
  return request("/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source }),
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

// The download/original/codec-preview-download routes serve real files to
// <a href download>, <audio src>, and direct navigation — none of which
// can attach the Authorization header request() uses. They're checked
// against ?dl=<token> instead (see backend's downloadTokenService.js /
// server.js) — this fetches and caches that token (server-side TTL is 6h;
// refetched a bit before that so a long-open tab doesn't hand out a URL
// that's about to go stale).
let _downloadToken = null;
let _downloadTokenFetchedAt = 0;
const DOWNLOAD_TOKEN_SOFT_TTL_MS = 5 * 60 * 60 * 1000;

async function getDownloadToken() {
  if (_downloadToken && Date.now() - _downloadTokenFetchedAt < DOWNLOAD_TOKEN_SOFT_TTL_MS) {
    return _downloadToken;
  }
  const { token } = await request("/download-token");
  _downloadToken = token;
  _downloadTokenFetchedAt = Date.now();
  return token;
}

// Same as toAbsoluteUrl, but appends the download token so the resulting
// URL actually works when handed to <a href>/<audio src>/window navigation
// instead of 401ing with "Missing or malformed Authorization header".
export async function toAuthedDownloadUrl(path) {
  const token = await getDownloadToken();
  const separator = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${separator}dl=${encodeURIComponent(token)}`;
}

// A plain <a href download> saves whatever bytes come back no matter what
// they actually are — if the request 401s/404s/500s, the browser happily
// "downloads" the error page's HTML/JSON body with an audio-looking
// filename instead of failing visibly. This fetches first, checks the
// response actually succeeded and isn't HTML, and only then saves it —
// throwing a real error otherwise instead of silently handing the user a
// broken file that looks like it worked.
export async function downloadFileSafely(url, filename) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not reach the download — ${error.message}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("text/html")) {
    let detail = `Download failed (HTTP ${response.status})`;
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      if (payload?.detail) detail = payload.detail;
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
