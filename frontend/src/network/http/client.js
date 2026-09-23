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
  const { public: isPublic, ...fetchOptions } = options;
  options = fetchOptions;
  try {
    // Public endpoints (share links) never carry the viewer's session, so
    // they behave identically for the owner and for a recipient with no
    // account.
    const headers = { ...(options.headers || {}), ...(isPublic ? {} : await authHeader(forceRefresh)) };
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
  if (response.status === 401 && !options.public && getFirebaseAuth()?.currentUser) {
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
    if (response.status === 401 && !options.public && isJson && payload?.code === "SESSION_EXPIRED") {
      getFirebaseAuth()
        ?.signOut()
        .finally(() => {
          if (typeof window !== "undefined") {
            window.location.href = "/login?reason=session_expired";
          }
        });
    }
    const detail = isJson ? payload?.detail || JSON.stringify(payload) : payload;
    const requestError = new Error(detail || `HTTP ${response.status}`);
    requestError.status = response.status;
    requestError.code = isJson ? payload?.code : undefined;
    throw requestError;
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

// Decode + measure only (see backend/app/api/routes/mastering.py:/analyze)
// — the one-time, real-audio-decode half of the live "professional
// controls" preview. Uses the same generous timeout as /master since it's
// a real audio decode, not the cheap math /preview-params below is.
export async function postAnalyzeAudio(formData) {
  return request("/analyze", {
    method: "POST",
    body: formData,
  }, MASTERING_TIMEOUT_MS);
}

// Pure computation on an already-analyzed track — cheap enough to call on
// every genre/style/tweak change, so this uses the default (short) timeout
// rather than MASTERING_TIMEOUT_MS.
export async function postPreviewParams(formData) {
  return request("/preview-params", {
    method: "POST",
    body: formData,
  });
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

// Backs the dedicated result view (/app?job=:jobId) — full detail for
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

// Share links (see backend-node/src/services/shareLinkService.js). The raw
// link (with its token) is returned ONLY by createShareLink — the server
// keeps just a hash, so listShareLinks returns metadata, never URLs.
export async function createShareLink(jobId, { expiresInSeconds = null, maxDownloads = null } = {}) {
  return request(`/jobs/${jobId}/share-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expires_in_seconds: expiresInSeconds, max_downloads: maxDownloads }),
  });
}

export async function listShareLinks(jobId) {
  return request(`/jobs/${jobId}/share-links`);
}

export async function revokeShareLink(linkId) {
  return request(`/share-links/${encodeURIComponent(linkId)}`, { method: "DELETE" });
}

// Public (recipient side). The token travels in a header, never in a URL,
// so it can't end up in server access logs or Referer headers.
export async function getShareLinkInfo(token) {
  return request("/shared/link/info", { public: true, headers: { "X-Share-Token": token } });
}

export async function downloadSharedFile(token, filename) {
  return downloadFileSafely(`${API_BASE}/shared/link/download`, filename, { "X-Share-Token": token });
}

// Public — no signed-in user needed (or expected). Backs the simple
// /shared/[jobId] page a share link points recipients at.
export async function getSharedJobInfo(jobId, token) {
  return request(`/shared/${jobId}/info?token=${encodeURIComponent(token)}`, { public: true });
}

export async function deleteAccountData() {
  return request("/account", { method: "DELETE" });
}

export async function postSignOutEverywhere() {
  return request("/account/sign-out-everywhere", { method: "POST" });
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
// subscription (see PlansPanel.jsx) — modifies that subscription in
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

// Private admin analytics dashboard (/admin/analytics/*) — every one of
// these hits /analytics/admin/*, which requireAuth (this same Bearer
// token, attached automatically above) AND requireAdmin (role === "admin"
// on the caller's own Firestore user doc, checked server-side) both gate.
// A non-admin gets a real 403 from the backend, same as any other blocked
// request through this client — nothing about admin access is decided
// here on the frontend.
export async function getAdminAnalytics(path, params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString();
  return request(`/analytics/admin${path}${qs ? `?${qs}` : ""}`);
}

// CSV/PDF export — a plain <a href> can't attach the Authorization header
// this API requires, so this fetches the file as a blob (with the same
// auth header every other admin call already gets via authHeader()) and
// triggers the browser's normal download UI from that blob instead of
// navigating to the URL directly. `prefix` is the same kind of admin
// route prefix getAdminAnalytics hard-codes (e.g. "/analytics/admin") —
// passed explicitly here since this is shared by every admin export
// surface, not just analytics.
export async function downloadAdminExport(prefix, path, params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString();
  const url = `${API_BASE}${prefix}${path}${qs ? `?${qs}` : ""}`;
  const headers = await authHeader();
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      detail = JSON.parse(text)?.detail || text;
    } catch {
      // plain text/empty body — use as-is
    }
    throw new Error(detail || `Export failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "export";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

// Admin Users panel (/admin/users) — same auth/authorization shape as
// getAdminAnalytics (requireAuth + requireAdmin, both server-side), just a
// different route prefix (/users/admin, not /analytics/admin — see
// adminUsersRoutes.js for why the prefix can't be "/admin/...").
export async function getAdminUsers(path, params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString();
  return request(`/users/admin${path}${qs ? `?${qs}` : ""}`);
}

export async function postSendPasswordReset(uid) {
  return request(`/users/admin/${encodeURIComponent(uid)}/reset-password`, { method: "POST" });
}

// Fixes exactly the "Polar has an active subscription, Firestore has
// none" gap — asks Polar directly for this uid's real subscriptions and
// writes them into Firestore (backend-node's reconcileUserSubscription).
export async function postResyncSubscription(uid) {
  return request(`/users/admin/${encodeURIComponent(uid)}/resync-subscription`, { method: "POST" });
}

export async function postSetUserDisabled(uid, disabled) {
  return request(`/users/admin/${encodeURIComponent(uid)}/disabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled }),
  });
}

// Admin notification bell (/notifications/admin) — same pattern again.
export async function getAdminNotifications(path, params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString();
  return request(`/notifications/admin${path}${qs ? `?${qs}` : ""}`);
}

export async function postMarkNotificationRead(id) {
  return request(`/notifications/admin/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export async function postMarkAllNotificationsRead() {
  return request("/notifications/admin/read-all", { method: "POST" });
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
export async function downloadFileSafely(url, filename, headers = undefined) {
  let response;
  try {
    response = await fetch(url, headers ? { headers, cache: "no-store" } : undefined);
  } catch (error) {
    throw new Error(`Could not reach the download — ${error.message}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("text/html")) {
    let detail = `Download failed (HTTP ${response.status})`;
    let code;
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      if (payload?.detail) detail = payload.detail;
      code = payload?.code;
    }
    const downloadError = new Error(detail);
    downloadError.status = response.status;
    downloadError.code = code;
    throw downloadError;
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
