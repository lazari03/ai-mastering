import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Terms & Conditions — Auralith Forge",
  description: "The terms that govern use of Auralith Forge's AI mastering service.",
  path: "/terms",
  keywords: ["mastering software terms of service"],
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <section>
        <h2>1. Acceptance of these Terms</h2>
        <p>
          These Terms & Conditions (&quot;Terms&quot;) form a legal agreement between you and Auralith Forge
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) governing your use of the Auralith Forge website and
          audio mastering application (the &quot;Service&quot;). By creating an account or using the Service, you
          confirm that you accept these Terms and our Privacy Policy, and agree to comply with them. If you do not
          agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. What the Service does</h2>
        <p>
          Auralith Forge lets you upload audio files and run them through automated digital signal processing
          (&quot;DSP&quot;) — equalization, compression, saturation, stereo imaging, and loudness/true-peak
          limiting — to produce a mastered output file. It also offers related tools: noise-reduction &quot;clean
          audio&quot; processing, chord/key/BPM detection, and codec-compression previews. Processing is automated;
          no human listens to or reviews your uploads as part of delivering the Service.
        </p>
      </section>

      <section>
        <h2>3. Eligibility and your account</h2>
        <p>
          You must be at least 16 years old, or the age of digital consent in your country if higher, to create an
          account. You agree to provide accurate registration information (including your name, email, and phone
          number) and to keep it up to date. You are responsible for all activity under your account and for
          keeping your login credentials confidential.
        </p>
      </section>

      <section>
        <h2>4. Your content</h2>
        <p>
          You retain all ownership rights in the audio files you upload and the mastered files the Service produces
          from them (&quot;Your Content&quot;). You grant us a limited, non-exclusive license to store, process, and
          transmit Your Content solely to operate and provide the Service to you.
        </p>
        <p>
          <strong>You are solely responsible for Your Content.</strong> By uploading a file, you confirm that you
          own it or have all necessary rights and permissions to upload it and have it processed by the Service, and
          that doing so does not infringe any third party&apos;s copyright or other rights. We do not review uploads
          for infringing or unlawful content before processing them.
        </p>
        <p>
          <strong>Storage is temporary, not a backup.</strong> Uploaded files, mastered output, and codec previews
          are automatically and permanently deleted from our servers a limited time after you create them (currently
          48 hours) — download what you need before then. We don&apos;t offer long-term or unlimited storage on the
          free tier; if you need your files retained longer than that, that would be a separate paid storage
          feature, not something the Service does today.
        </p>
      </section>

      <section>
        <h2>5. Copyright claims and takedown requests</h2>
        <p>
          We do not claim ownership of, and accept no liability for, content you upload. That said, if we receive a
          credible claim that content you uploaded or processed infringes someone else&apos;s copyright or other
          rights (a &quot;Claim&quot;), we may, at our discretion and without prior notice to you:
        </p>
        <ul>
          <li>Remove or disable access to the content in question;</li>
          <li>Suspend or terminate the account that uploaded it;</li>
          <li>
            <strong>Disclose your account information</strong> (including your name, email, and any information
            relevant to the Claim) to the person or entity making the Claim, their legal representative, or a court
            or public authority, to the extent necessary to respond to or resolve it.
          </li>
        </ul>
        <p>
          By using the Service, you agree to indemnify and hold Auralith Forge harmless from any claim, damages,
          liability, or legal cost (including reasonable attorneys&apos; fees) arising from Your Content or your
          violation of this section.
        </p>
        <p>
          If you believe content on the Service infringes your rights, or you&apos;ve received notice that content
          you uploaded is under dispute, contact{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>{" "}
          with enough detail to identify the content and the rights in question.
        </p>
        <p>
          We are working on automated copyright/rights-detection for uploaded content to catch obvious infringement
          earlier in the process. It is not built yet — today, review before you upload is entirely on you, per
          Section 4.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload content you don&apos;t have the rights to, or that is unlawful, defamatory, or infringing;</li>
          <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Service or its infrastructure;</li>
          <li>Reverse-engineer, scrape, or resell the Service without our written permission;</li>
          <li>Use the Service to process content that violates applicable law.</li>
        </ul>
      </section>

      <section>
        <h2>7. Saved Artist presets</h2>
        <p>
          The Service lets you save named mastering profiles (&quot;Saved Artist&quot; presets) tied to your
          account. These are private to your account, stored indefinitely (unlike audio files — see Section 4)
          since they contain no audio, and are treated as Your Content under Section 4.
        </p>
      </section>

      <section>
        <h2>8. Fees and paid plans</h2>
        <p>
          Clean Audio is free, unlimited. Mastering previews (30-second, Standard engine) are free, unlimited, and
          every account gets 3 free full-length Standard masters per calendar month. Beyond that, mastering and
          stem separation require the Studio or All-Access monthly plan; chord detection is available as a
          one-time credit or unlimited on the All-Access plan. Current pricing is listed in the app (Settings →
          Billing) and may change; we&apos;ll show you the price before you pay, every time. Our{" "}
          <a href="/refund" className="text-brass hover:text-ember">Refund Policy</a> applies to all purchases.
        </p>
        <p>
          Studio and All-Access subscriptions renew automatically each month until you cancel. You can cancel
          anytime from Settings → Billing → Manage billing — it stays active through the end of the period you
          already paid for, then does not renew.
        </p>
      </section>

      <section>
        <h2>9. Third-party services</h2>
        <p>
          We use Firebase Authentication and Firestore (Google Cloud) to manage accounts and store account and
          preset data (never audio — see Section 4). Your use of the Service is also subject to Google&apos;s
          applicable terms for those underlying services.
        </p>
      </section>

      <section>
        <h2>10. Disclaimer of warranties</h2>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind,
          whether express or implied. We do not guarantee that processing results will meet your expectations, that
          the Service will be uninterrupted or error-free, or that it is fit for any particular commercial or
          broadcast standard.
        </p>
      </section>

      <section>
        <h2>11. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Auralith Forge will not be liable for any indirect, incidental, or
          consequential damages, or for any loss of data, revenue, or business, arising from your use of the
          Service. Our total liability for any claim relating to the Service is limited to the amount you paid us,
          if any, in the twelve months preceding the claim.
        </p>
      </section>

      <section>
        <h2>12. Termination</h2>
        <p>
          You may stop using the Service and request deletion of your account at any time by contacting us. We may
          suspend or terminate your account if you violate these Terms, the Acceptable Use section, or the
          Copyright Claims section above.
        </p>
      </section>

      <section>
        <h2>13. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we will update the &quot;Last
          updated&quot; date above and, where practical, notify you. Continued use of the Service after a change
          means you accept the updated Terms.
        </p>
      </section>

      <section>
        <h2>14. Governing law</h2>
        <p>
          <em>[Placeholder — insert the country/state whose law governs these Terms and where disputes will be
          resolved, before publishing this publicly.]</em>
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
