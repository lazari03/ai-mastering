import dns from "node:dns/promises";

// MX-record check — the same class of problem Polar's checkout hit
// ("testt@test.com is not a valid email address: the domain does not
// accept email") but caught at signup instead of at checkout, using
// Node's built-in dns module (no new dependency, no third-party
// verification API/key needed). Not a full deliverability guarantee — a
// domain can have valid MX records and still bounce a specific mailbox —
// but it reliably catches the actual failure mode seen here: an
// obviously-fake or non-mail-accepting domain.
const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export async function isEmailDeliverable(email) {
  const match = EMAIL_RE.exec(String(email || "").trim());
  if (!match) return false;
  const domain = match[1].toLowerCase();
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch (error) {
    // ENOTFOUND/ENODATA — domain has no MX records, or doesn't exist at
    // all. Any other error (DNS server hiccup, timeout) fails open rather
    // than blocking a real signup over a transient lookup problem.
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") return false;
    console.warn(`MX lookup for "${domain}" failed non-conclusively, allowing:`, error.code || error.message);
    return true;
  }
}
