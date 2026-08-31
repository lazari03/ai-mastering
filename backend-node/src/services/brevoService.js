import { settings } from "../config/settings.js";

const SENDER = { name: "Auralith Forge", email: "studio@auralithforge.app" };

// Transactional Email API — https://developers.brevo.com/reference/sendtransacemail
// — a different Brevo product from the Contacts/list API above (one sends
// a single email right now to one address; the other manages who's on a
// marketing list for future campaigns). Sent from studio@auralithforge.app
// under the auralithforge.app domain, which is DNS-authenticated in Brevo
// (Senders > Domains) — required for this to actually deliver instead of
// landing in spam or being rejected outright.
const SEND_URL = "https://api.brevo.com/v3/smtp/email";

function welcomeEmailHtml(firstName) {
  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0f1113;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1113;padding:32px 16px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#16181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#dfc95a;">Auralith Forge</p>
            <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#ffffff;">${greeting} welcome aboard.</h1>
            <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#c7c9cc;">
              Your account's ready. You've got 3 full-length masters free, no card required — drop a track in and hear the difference.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr><td style="background:linear-gradient(135deg,#e85d2a,#dfc95a);border-radius:999px;">
                <a href="https://auralithforge.app/app" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#100b08;text-decoration:none;">Open the Studio →</a>
              </td></tr>
            </table>
            <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#7a7d82;">
              Questions? Just reply to this email — a real person reads it.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Best-effort, always, same as everything else in this file — a welcome
// email failing to send must never fail account creation itself. Fired
// once per account, from the same isNewSignup signal profileService.js
// already uses for the Telegram admin notification (termsAcceptedAt only
// arrives on the one call right after signup, never from a later Settings
// edit).
export async function sendWelcomeEmail(email, firstName) {
  if (!settings.brevoApiKey) return;
  try {
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": settings.brevoApiKey,
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email }],
        subject: "Welcome to Auralith Forge",
        htmlContent: welcomeEmailHtml(firstName),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Brevo welcome email failed (${res.status}):`, body);
    }
  } catch (error) {
    console.error("Brevo welcome email failed (non-fatal):", error.message);
  }
}

// Contacts API — https://developers.brevo.com/reference/createcontact.
// updateEnabled:true makes this idempotent for a repeat subscribe (same
// shape as newsletterService.js's own Firestore doc-id-is-the-email
// idempotency) — Brevo updates the existing contact and adds it to the
// list instead of erroring on a duplicate email.
const CONTACTS_URL = "https://api.brevo.com/v3/contacts";

// Best-effort, always — called from the newsletter subscribe flow, which
// must succeed (and keep working) even if Brevo is unreachable,
// misconfigured, or the API key is simply unset. The Firestore record is
// the source of truth for "did they subscribe"; this is just getting
// that email into the tool that actually sends campaigns.
export async function addToBrevoNewsletter(email, source) {
  if (!settings.brevoApiKey) return;
  try {
    const res = await fetch(CONTACTS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": settings.brevoApiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [settings.brevoListId],
        updateEnabled: true,
        attributes: { SIGNUP_SOURCE: source || "unknown" },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Brevo contact upsert failed (${res.status}):`, body);
    }
  } catch (error) {
    console.error("Brevo contact upsert failed (non-fatal):", error.message);
  }
}
