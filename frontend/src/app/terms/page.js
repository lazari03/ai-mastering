import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";
import { PRODUCT } from "@/lib/product";
import { PLANS, SINGLE_MASTER, STEM_SEPARATION } from "@/lib/pricing";

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
          limiting — to produce a mastered output file. Each master starts by analyzing your file; the engine then
          corrects what it measures and leaves the rest alone, guided by the genre, style, objective and direction you
          choose. It also offers related tools: chord/key/BPM detection, a LUFS loudness meter, reference-track
          mastering, stem separation (vocals and accompaniment), codec-compression previews, and share links for
          finished masters. Processing is automated; no human listens to or reviews your uploads as part of
          delivering the Service.
        </p>
      </section>

      <section>
        <h2>3. Eligibility and your account</h2>
        <p>
          You must be at least 16 years old, or the age of digital consent in your country if higher, to create an
          account. You agree to provide accurate registration information (your name, email and phone number, or
          your Google account if you sign in with Google) and to keep it up to date. You are responsible for all activity under your account and for
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
          are automatically and permanently deleted from our servers {PRODUCT.retentionHours} hours after you create
          them, on every plan — download what you need before then. Share links stop working when the files they
          point to are deleted. The Service does not offer long-term audio storage.
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
          <a href="mailto:studio@auralithforge.app">studio@auralithforge.app</a>{" "}
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
        <h2>7. Artist Profiles</h2>
        <p>
          The Service lets you save named Artist Profiles tied to your account: the genre, style, objective and
          direction you chose, and any processing chain you import as a JSON file. They contain no audio, are
          private to your account, are kept until you delete them or your account (unlike audio files — see Section
          4), and are treated as Your Content under Section 4.
        </p>
        <p>
          <strong>Share links.</strong> On plans that include them, you can create a link that lets anyone who has
          it download a finished master, until the link expires, is revoked, or the files are deleted. You are
          responsible for who you share a link with.
        </p>
      </section>

      <section>
        <h2>8. Fees and paid plans</h2>
        <p>
          Mastering previews ({PRODUCT.previewSeconds}-second, Standard engine) and chord/key/BPM detection are free
          and unlimited for every account, including a free one. Every account also gets {PRODUCT.freeMasters} free
          full-length masters as a one-time trial that never resets. Beyond that:
        </p>
        <ul>
          <li><strong>{PLANS.indie.label}</strong> — {PLANS.indie.masterLimit} masters per month, Standard engine;</li>
          <li><strong>{PLANS.studio.label}</strong> — {PLANS.studio.masterLimit} masters per month, Standard and Professional engines;</li>
          <li>
            <strong>{PLANS.pro.label}</strong> — {PLANS.pro.masterLimit} masters per month, both engines,{" "}
            {PRODUCT.stems.includedPerMonth} stem-separated masters per month, and share links;
          </li>
          <li>
            One-time purchases, on any plan: a {SINGLE_MASTER.label} credit (one extra full-length master) or a{" "}
            {STEM_SEPARATION.label} credit (one stem-separated master). Credits are used automatically when your plan
            allowance runs out.
          </li>
        </ul>
        <p>
          Monthly allowances reset at the start of each billing period and do not roll over. Prices are shown on
          the <a href="/pricing">pricing page</a> and in the app, may change for future periods, and are always shown
          before you pay. Payments are processed by Polar, our merchant of record, which handles checkout, invoices
          and applicable sales tax/VAT; its terms also apply to the purchase. Our <a href="/refund">Refund Policy</a>{" "}
          applies to all purchases.
        </p>
        <p>
          Subscriptions (monthly or annual) renew automatically at the end of each period until you cancel. You can
          cancel anytime from Settings → Billing → Manage billing — the plan stays active until the end of the period
          you already paid for, then does not renew.
        </p>
      </section>

      <section>
        <h2>9. Third-party services</h2>
        <p>
          The Service relies on third-party providers, including Google Firebase (sign-in and account data),
          Cloudflare (network delivery and security), Polar (payments) and Brevo (email). Our{" "}
          <a href="/privacy">Privacy Policy</a> lists them and what each receives. Your use of those parts of the
          Service is also subject to the providers&apos; applicable terms.
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
          You may stop using the Service and delete your account at any time from Settings (or by contacting us).
          Deleting your account removes your profile, Artist Profiles, master history and share links. We may
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
          <a href="mailto:studio@auralithforge.app">studio@auralithforge.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
