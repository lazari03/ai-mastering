import { settings } from "../config/settings.js";

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
