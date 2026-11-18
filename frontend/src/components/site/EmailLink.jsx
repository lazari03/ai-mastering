// Contact email link that survives Cloudflare's Email Obfuscation.
//
// With Scrape Shield → Email Address Obfuscation on, Cloudflare rewrites
// every mailto: anchor in the HTML into /cdn-cgi/l/email-protection#<hex>
// and decodes it with an injected script. Crawlers (and SEO audits) see a
// link to a Cloudflare utility URL instead of the address. Cloudflare skips
// anything between <!--email_off--> and <!--email_on-->; React can't emit
// HTML comments directly, so the anchor is rendered as a static string.
// Everything interpolated is a constant — never pass user input here.
export const CONTACT_EMAIL = "studio@auralithforge.app";

const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default function EmailLink({ email = CONTACT_EMAIL, className = "" }) {
  const cls = className ? ` class="${escapeAttr(className)}"` : "";
  const html = `<!--email_off--><a href="mailto:${escapeAttr(email)}"${cls}>${escapeAttr(email)}</a><!--email_on-->`;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
