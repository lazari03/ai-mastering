import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";

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
          <li><strong>Account data:</strong> first name, last name, email address, phone number, and password (handled by Firebase Authentication — we never see or store your password in plain text).</li>
          <li><strong>Content you upload:</strong> the audio files you submit for mastering, cleaning, or chord detection, and the output files the Service produces.</li>
          <li><strong>Preset data:</strong> any Saved Artist mastering presets you create, tied to your account.</li>
          <li><strong>Usage data:</strong> basic technical logs needed to operate and secure the Service (e.g. request timestamps, error logs).</li>
          <li><strong>Preferences:</strong> your selected display language, stored locally in your browser.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use your data</h2>
        <p>We use your data to:</p>
        <ul>
          <li>Create and manage your account, and authenticate you when you sign in;</li>
          <li>Process the audio you upload and deliver the mastered/cleaned output back to you;</li>
          <li>Store your Saved Artist presets so you can reuse them;</li>
          <li>Respond to support requests you send us;</li>
          <li>Maintain the security and reliability of the Service.</li>
        </ul>
        <p>We do not sell your personal data, and we do not use your uploaded audio to train any model.</p>
      </section>

      <section>
        <h2>4. Who we share data with</h2>
        <p>
          We use the following third-party processors to operate the Service, each of which processes data on our
          behalf under its own security and privacy commitments:
        </p>
        <ul>
          <li><strong>Firebase Authentication</strong> (Google) — manages sign-up/sign-in and issues session tokens;</li>
          <li><strong>Firestore</strong> (Google Cloud) — stores your account profile and Saved Artist presets;</li>
          <li>Our application server infrastructure, which processes uploaded audio to produce mastered output.</li>
        </ul>
        <p>We do not otherwise share your personal data with third parties, except where required by law.</p>
      </section>

      <section>
        <h2>5. Data retention</h2>
        <p>
          We retain your account data and Saved Artist presets for as long as your account is active — these
          contain no audio, so keeping them costs us very little and lets your presets survive between sessions.
          Uploaded audio files, mastered output, and codec previews are different: they are automatically and
          permanently deleted from our servers 48 hours after you create them. Download what you need before then —
          we do not offer long-term audio storage on the free tier.
        </p>
      </section>

      <section>
        <h2>6. Your rights</h2>
        <p>
          Depending on where you live, you may have rights to access, correct, export, or delete your personal
          data, and to object to or restrict certain processing. We don&apos;t yet have a fully self-service
          tool for this — to exercise any of these rights today, email{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>{" "}
          and we will action your request.
        </p>
      </section>

      <section>
        <h2>7. Cookies and local storage</h2>
        <p>
          We use your browser&apos;s local storage (not tracking cookies) to remember your signed-in session and
          your language preference. We do not use advertising or third-party tracking cookies.
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
          Our infrastructure and third-party processors (Firebase/Google Cloud) may store and process data in
          countries other than your own. Where required, we rely on those providers&apos; standard contractual
          safeguards for such transfers.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use industry-standard practices to protect your data, including encrypted connections (HTTPS) and
          delegating password handling entirely to Firebase Authentication. No system is 100% secure, and we
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
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
