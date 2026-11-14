import crypto from "node:crypto";

import { settings } from "../config/settings.js";
import { getFirestore as getRealFirestore, getAuth as getRealAuth } from "../config/firebase.js";

// Lifecycle emails — the three moments where a signed-up user is closest to
// paying and, before this file, heard nothing from us at all (Brevo only
// ever sent the welcome email and password resets):
//
//   first_master        right after the first real (non-preview) master
//   trial_exhausted     when the last free master has just been used
//   abandoned_checkout  ~1 hour after a checkout was opened and never paid
//
// Rules every one of them follows:
//   - OFF unless LIFECYCLE_EMAILS_ENABLED=true and BREVO_API_KEY is set, so
//     deploying this file sends nothing until the owner turns it on.
//   - At most once per account per type (users/{uid}.lifecycleEmails.<type>,
//     claimed in a transaction BEFORE sending, so a retry or a concurrent
//     request can never double-send).
//   - Every email carries a one-click unsubscribe link, and an opted-out
//     account (users/{uid}.lifecycleEmailsOptOut) is never emailed again.
//   - Best-effort: nothing here may throw into, or delay, a master or a
//     checkout. Callers fire-and-forget.
//
// English only for now — the user's UI language lives in the browser
// (localStorage, see frontend lib/i18n.js), not on the profile.

const SEND_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "Auralith Forge", email: "studio@auralithforge.app" };
const SITE = "https://auralithforge.app";
const API_BASE = "https://api.auralithforge.app";

export const LIFECYCLE_TYPES = ["first_master", "trial_exhausted", "abandoned_checkout"];

// Display prices. The real prices live on the Polar products; these mirror
// frontend/src/lib/pricing.js (PLANS / SINGLE_MASTER) — change both together.
const PRICES = { single: "€2.99", indie: "€4.99/mo", indieMasters: 15, studio: "€9.99/mo", studioMasters: 50 };

// Abandoned checkout: wait an hour (most people who are going to pay do it
// within minutes), and never chase a checkout older than two days.
export const ABANDONED_MIN_AGE_MS = 60 * 60 * 1000;
export const ABANDONED_MAX_AGE_MS = 48 * 60 * 60 * 1000;

let firestoreOverride = null;
let authOverride = null;
let fetchOverride = null;
let enabledOverride = null;
export function _setDepsForTests({ db = null, auth = null, fetchImpl = null, enabled = null } = {}) {
  firestoreOverride = db;
  authOverride = auth;
  fetchOverride = fetchImpl;
  enabledOverride = enabled;
}
const getFirestore = () => firestoreOverride || getRealFirestore();
const getAuth = () => authOverride || getRealAuth();
const doFetch = (...args) => (fetchOverride || fetch)(...args);

export function lifecycleEmailsEnabled() {
  if (enabledOverride !== null) return enabledOverride;
  return settings.lifecycleEmailsEnabled === true && Boolean(settings.brevoApiKey);
}

function userDoc(uid) {
  return getFirestore().collection("users").doc(uid);
}

// ---- Unsubscribe token --------------------------------------------------
// HMAC over the uid, no expiry: an unsubscribe link in a months-old email
// must still work. Signed with the same persistent secret as download
// links (docker-compose refuses to start without DOWNLOAD_TOKEN_SECRET).
// The token only ever grants "stop emailing this account" — nothing else.
function sign(uid) {
  return crypto.createHmac("sha256", settings.downloadTokenSecret).update(`lifecycle-unsub:${uid}`).digest("base64url");
}

export function mintUnsubscribeToken(uid) {
  return `${Buffer.from(uid).toString("base64url")}.${sign(uid)}`;
}

export function verifyUnsubscribeToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encodedUid, sig] = token.split(".");
  let uid;
  try {
    uid = Buffer.from(encodedUid, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!uid) return null;
  const expected = sign(uid);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return uid;
}

export function unsubscribeUrl(uid) {
  return `${API_BASE}/email/unsubscribe?token=${encodeURIComponent(mintUnsubscribeToken(uid))}`;
}

export async function optOut(uid) {
  await userDoc(uid).set({ lifecycleEmailsOptOut: true }, { merge: true });
}

// ---- Templates ----------------------------------------------------------
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function link(path, type) {
  const url = new URL(path, SITE);
  url.searchParams.set("utm_source", "lifecycle");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", type);
  return url.toString();
}

function layout({ heading, paragraphs, cta, footerUrl }) {
  const body = paragraphs
    .map((p) => `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#c7c9cc;">${p}</p>`)
    .join("\n            ");
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0f1113;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1113;padding:32px 16px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#16181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#dfc95a;">Auralith Forge</p>
            <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#ffffff;">${heading}</h1>
            ${body}
            <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr><td style="background:linear-gradient(135deg,#e85d2a,#dfc95a);border-radius:999px;">
                <a href="${cta.url}" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#100b08;text-decoration:none;">${cta.label}</a>
              </td></tr>
            </table>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8a8d91;">
              Questions? Just reply — a person reads this inbox.<br />
              <a href="${footerUrl}" style="color:#8a8d91;">Unsubscribe from these emails</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Pure: (type, context) -> { subject, htmlContent }. Returns null for an
// unknown type so a typo can never send a blank email.
export function buildLifecycleEmail(type, { uid, firstName = "", freeMastersLeft = null, productLabel = "" } = {}) {
  const hey = firstName ? `Hey ${escapeHtml(firstName)},` : "Hey,";
  const footerUrl = unsubscribeUrl(uid);
  if (type === "first_master") {
    const left =
      Number.isInteger(freeMastersLeft) && freeMastersLeft > 0
        ? `You still have ${freeMastersLeft} free full-length master${freeMastersLeft === 1 ? "" : "s"} — try a different genre or direction on the same track and A/B them.`
        : "Try a different genre or direction on the same track and A/B the results.";
    return {
      subject: "Your first master is ready — files are kept for 48 hours",
      htmlContent: layout({
        heading: `${hey} your first master is done.`,
        paragraphs: [
          "It's in <strong>My Masters</strong>, with the full report of what the engine changed and what it left alone. Audio files are deleted 48 hours after they're created, so download the WAV while it's there.",
          "Working with someone else on the track? Create a share link from My Masters and they can download the master without an account.",
          left,
        ],
        cta: { label: "Open My Masters →", url: link("/app", type) },
        footerUrl,
      }),
    };
  }
  if (type === "trial_exhausted") {
    return {
      subject: "You've used your 3 free masters — here's what's next",
      htmlContent: layout({
        heading: `${hey} that was your last free master.`,
        paragraphs: [
          "The free trial is three full masters, one time. Previews (30 seconds, unlimited), the LUFS meter and chord/key/BPM detection stay free.",
          `To keep mastering full tracks: a <strong>single master is ${PRICES.single}</strong> with no subscription, or <strong>Indie is ${PRICES.indie}</strong> for ${PRICES.indieMasters} masters a month. Studio (${PRICES.studio}, ${PRICES.studioMasters} a month) adds the Professional engine. Cancel any time.`,
          "If something about the result held you back, reply and tell me what — that's the most useful thing you can send.",
        ],
        cta: { label: "See plans →", url: link("/pricing", type) },
        footerUrl,
      }),
    };
  }
  if (type === "abandoned_checkout") {
    const what = productLabel ? ` for ${escapeHtml(productLabel)}` : "";
    return {
      subject: "Your Auralith Forge checkout is still open",
      htmlContent: layout({
        heading: `${hey} you didn't finish checking out.`,
        paragraphs: [
          `You opened a checkout${what} and it wasn't completed. Nothing was charged.`,
          "If a payment method failed or a question came up, reply to this email and I'll sort it out. Otherwise you can pick up where you left off.",
        ],
        cta: { label: "Back to plans →", url: link("/pricing", type) },
        footerUrl,
      }),
    };
  }
  return null;
}

// ---- Send ---------------------------------------------------------------
// Claims the per-account, per-type slot. False when already sent or the
// account opted out.
async function claim(uid, type) {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = userDoc(uid);
    const data = (await tx.get(ref)).data() || {};
    if (data.lifecycleEmailsOptOut === true) return false;
    if (data.lifecycleEmails?.[type]) return false;
    tx.set(ref, { lifecycleEmails: { [type]: new Date() } }, { merge: true });
    return true;
  });
}

async function resolveRecipient(uid, email, firstName) {
  let to = email || null;
  let name = firstName || "";
  if (!to || !name) {
    const data = (await userDoc(uid).get()).data() || {};
    name = name || data.firstName || "";
    to = to || data.email || null;
  }
  if (!to) {
    try {
      to = (await getAuth().getUser(uid)).email || null;
    } catch {
      to = null;
    }
  }
  return { to, name };
}

// Returns "sent" | "disabled" | "skipped" | "no_email" | "failed". Never throws.
export async function sendLifecycleEmail(type, { uid, email = null, firstName = "", context = {} } = {}) {
  try {
    if (!lifecycleEmailsEnabled()) return "disabled";
    if (!uid || !LIFECYCLE_TYPES.includes(type)) return "skipped";
    const { to, name } = await resolveRecipient(uid, email, firstName);
    if (!to) return "no_email";
    if (!(await claim(uid, type))) return "skipped";
    const built = buildLifecycleEmail(type, { uid, firstName: name, ...context });
    const res = await doFetch(SEND_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": settings.brevoApiKey || "" },
      body: JSON.stringify({
        sender: SENDER,
        replyTo: SENDER,
        to: [{ email: to }],
        subject: built.subject,
        htmlContent: built.htmlContent,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl(uid)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [`lifecycle_${type}`],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Lifecycle email ${type} failed (${res.status}):`, body);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error(`Lifecycle email ${type} failed (non-fatal):`, error.message);
    return "failed";
  }
}

// ---- Abandoned checkout -------------------------------------------------
// Stamped when a checkout URL is handed out, cleared by the payment
// webhook. Top-level Date field so the sweep is a single-field range query.
export async function markCheckoutStarted(uid, productKey) {
  try {
    await userDoc(uid).set({ pendingCheckoutAt: new Date(), pendingCheckoutProduct: String(productKey || "") }, { merge: true });
  } catch (error) {
    console.error("markCheckoutStarted failed (non-fatal):", error.message);
  }
}

// `db` lets polarService.js pass the Firestore handle it already holds (and
// its tests' fake), instead of this module resolving its own.
export async function clearPendingCheckout(uid, db = null) {
  try {
    await (db ? db.collection("users").doc(uid) : userDoc(uid)).set({ pendingCheckoutAt: null, pendingCheckoutProduct: null }, { merge: true });
  } catch (error) {
    console.error("clearPendingCheckout failed (non-fatal):", error.message);
  }
}

const PRODUCT_LABELS = {
  planIndie: "the Indie plan",
  planIndieAnnual: "the Indie plan (yearly)",
  planStudio: "the Studio plan",
  planStudioAnnual: "the Studio plan (yearly)",
  planPro: "the All-Access plan",
  planProAnnual: "the All-Access plan (yearly)",
  singleMaster: "a Single Master",
  stemSeparation: "a stem-separated master",
};

// One pass: every account whose checkout was opened more than an hour ago
// and never paid gets (at most) one reminder. The marker is cleared either
// way, so an account is looked at once per checkout, not on every sweep.
export async function sweepAbandonedCheckouts({ now = () => Date.now(), limit = 50 } = {}) {
  if (!lifecycleEmailsEnabled()) return { checked: 0, sent: 0 };
  const cutoff = new Date(now() - ABANDONED_MIN_AGE_MS);
  const snap = await getFirestore().collection("users").where("pendingCheckoutAt", "<=", cutoff).limit(limit).get();
  let sent = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const startedAt = data.pendingCheckoutAt?.toDate ? data.pendingCheckoutAt.toDate() : data.pendingCheckoutAt;
    const tooOld = !(startedAt instanceof Date) || now() - startedAt.getTime() > ABANDONED_MAX_AGE_MS;
    const productKey = data.pendingCheckoutProduct || "";
    await clearPendingCheckout(doc.id);
    if (tooOld) continue;
    const outcome = await sendLifecycleEmail("abandoned_checkout", {
      uid: doc.id,
      email: data.email || null,
      firstName: data.firstName || "",
      context: { productLabel: PRODUCT_LABELS[productKey] || "" },
    });
    if (outcome === "sent") sent += 1;
  }
  return { checked: snap.docs.length, sent };
}
