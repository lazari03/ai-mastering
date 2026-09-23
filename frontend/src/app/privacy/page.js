import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";
import { PRODUCT } from "@/lib/product";

export const metadata = buildMetadata({
  title: "Privacy Policy — Auralith Forge",
  description: "How Auralith Forge collects, uses, and protects your data.",
  path: "/privacy",
  keywords: ["mastering software privacy policy"],
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>1. What this covers</h2>
        <p>
          This Privacy Policy explains what personal data Auralith Forge (&quot;we&quot;, &quot;us&quot;) collects
          when you use our website and mastering application (the &quot;Service&quot;), why we collect it, and the
          choices you have about it.
        </p>
      </section>

      <section>
        <h2>2. Data we collect</h2>
        <p>We collect the following categories of data:</p>
        <ul>
          <li>
            <strong>Account data:</strong> first name, last name, email address, phone number and your acceptance of
            the Terms — or, if you sign in with Google, the name and email Google shares with us. Passwords are
            handled by Firebase Authentication; we never see or store them. If you use a free tool before signing up,
            Firebase creates an anonymous session identifier for you.
          </li>
          <li>
            <strong>Audio you upload:</strong> the files you submit for mastering, analysis, stem separation or as a
            reference track, and the files the Service produces from them.
          </li>
          <li>
            <strong>Artist Profiles:</strong> the profiles you save (genre, style, objective, direction) and any
            processing chains you import as JSON.
          </li>
          <li>
            <strong>Master history and share links:</strong> a record of each master (file name, settings used,
            measurements, time) and any share links you create.
          </li>
          <li>
            <strong>Billing data:</strong> your plan, credits and subscription status. Card details are collected and
            stored by Polar, our payment provider — never by us.
          </li>
          <li>
            <strong>Usage analytics:</strong> pages viewed and product events (for example &quot;upload started&quot;
            or &quot;master completed&quot;), referrer and campaign tags, device type, browser, operating system and
            country. Country is derived from your IP address at the moment of the request (by Cloudflare, or an
            offline lookup on our server); we do not store your IP address in analytics. See Section 7 for how your
            cookie choice affects this.
          </li>
          <li>
            <strong>Technical data:</strong> your IP address is processed in memory for rate limiting and may appear
            in short-lived server error logs used to run and secure the Service.
          </li>
          <li><strong>Newsletter:</strong> your email address, if you subscribe.</li>
          <li><strong>Support:</strong> whatever you send us when you contact us.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use your data</h2>
        <p>We use your data to:</p>
        <ul>
          <li>Create and manage your account and sign you in (to perform our contract with you);</li>
          <li>Process the audio you upload and deliver the results back to you (contract);</li>
          <li>Store your Artist Profiles, master history and share links so you can reuse them (contract);</li>
          <li>Handle payments, plan allowances and credits (contract, and legal obligations for billing records);</li>
          <li>Send a welcome email when you sign up and service messages about your account (contract);</li>
          <li>Send the newsletter, only if you subscribed (consent — unsubscribe anytime from any newsletter email);</li>
          <li>Understand how the Service is used and improve it (legitimate interest, or consent where Section 7 says so);</li>
          <li>Keep the Service secure and prevent abuse, such as rate limiting (legitimate interest);</li>
          <li>Respond to support requests.</li>
        </ul>
        <p>We do not sell your personal data, and we do not use your uploaded audio to train any model.</p>
      </section>

      <section>
        <h2>4. Who we share data with</h2>
        <p>We use these providers to run the Service. Each processes data on our behalf, only for that purpose:</p>
        <ul>
          <li><strong>Google Firebase</strong> (Authentication and Firestore) — sign-in, account profile, Artist Profiles, plan and credit records;</li>
          <li><strong>Cloudflare</strong> — delivers the website and API and protects them from attacks; it sees your IP address and request data in transit;</li>
          <li><strong>Polar</strong> — our payment provider and merchant of record: checkout, invoices, tax and refunds;</li>
          <li><strong>Brevo</strong> — sends the welcome email and, if you subscribed, the newsletter;</li>
          <li><strong>TelemetryDeck</strong> — privacy-focused product analytics, only if you accept analytics (Section 7). It receives events with a hashed identifier, not your name or email;</li>
          <li><strong>Plausible</strong> — cookieless page analytics, only if you accept analytics;</li>
          <li><strong>Telegram</strong> — internal notifications to our team about new sign-ups and purchases, which include the account email;</li>
          <li>Our own server infrastructure, which processes and temporarily stores your audio and holds master history and analytics.</li>
        </ul>
        <p>
          When you create a share link, anyone you give it to can download that master until the link expires or
          is revoked. We otherwise share personal data only where required by law, or as described in the copyright
          section of our <a href="/terms">Terms</a>.
        </p>
      </section>

      <section>
        <h2>5. Data retention</h2>
        <ul>
          <li>
            <strong>Audio</strong> (uploads, masters, stems, previews) is permanently deleted {PRODUCT.retentionHours}{" "}
            hours after you create it.
          </li>
          <li>
            <strong>Account data, Artist Profiles and master history</strong> are kept while your account exists and
            deleted when you delete your account. Master history entries also expire with their audio.
          </li>
          <li><strong>Share links</strong> are removed a week after they expire or are revoked.</li>
          <li>
            <strong>Analytics</strong> are kept for as long as they are useful for understanding usage. When you
            delete your account, they are unlinked from it.
          </li>
          <li>
            <strong>Billing records</strong> are kept by us and Polar for as long as tax and accounting law requires.
          </li>
          <li><strong>Newsletter</strong> subscriptions are kept until you unsubscribe.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your rights</h2>
        <p>
          Depending on where you live (including under the GDPR), you have the right to access, correct, export or
          delete your personal data, to object to or restrict certain processing, to withdraw consent at any time,
          and to complain to your data-protection authority. You can delete your account and its data yourself in
          Settings, and change your profile details there. For anything else, email{" "}
          <a href="mailto:studio@auralithforge.app">studio@auralithforge.app</a> and we will respond within 30 days.
        </p>
      </section>

      <section>
        <h2>7. Cookies, local storage and analytics</h2>
        <p>
          We do not use advertising or cross-site tracking cookies. We use your browser&apos;s local storage for
          things the Service needs: keeping you signed in, your language, and your cookie choice.
        </p>
        <p>
          Analytics depend on your choice in the cookie banner. If you <strong>accept</strong>, we store a random
          visitor ID and session ID in local storage so we can tell returning visits apart, and we load TelemetryDeck
          and Plausible. If you <strong>decline</strong> (or haven&apos;t chosen yet), nothing is stored for analytics
          and no third-party analytics load; we only count anonymous page views and product events with a temporary
          ID that is forgotten when you close the tab. You can change your choice by clearing this site&apos;s
          storage in your browser.
        </p>
      </section>

      <section>
        <h2>8. Children&apos;s privacy</h2>
        <p>
          The Service is not directed at children under 16. We do not knowingly collect personal data from children
          under 16; if you believe a child has provided us data, contact us and we will delete it.
        </p>
      </section>

      <section>
        <h2>9. International data transfers</h2>
        <p>
          Our infrastructure and the providers in Section 4 may store and process data in countries other than your
          own, including the United States. Where required, we rely on those providers&apos; Standard Contractual
          Clauses or equivalent safeguards for such transfers.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use industry-standard practices to protect your data, including encrypted connections (HTTPS), private
          per-account access to your files, time-limited revocable share links, and delegating password handling
          entirely to Firebase Authentication. No system is 100% secure, and we
          cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected in the &quot;Last
          updated&quot; date above.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          Questions about this Privacy Policy or your data? Email{" "}
          <a href="mailto:studio@auralithforge.app">studio@auralithforge.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
