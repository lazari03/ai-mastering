import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Refund Policy — Auralith Forge",
  description: "Refund terms for Auralith Forge purchases and subscriptions.",
  path: "/refund",
  keywords: ["mastering software refund policy"],
});

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy">
      <section>
        <h2>1. What's paid</h2>
        <p>
          Clean Audio and mastering previews are free, unlimited, and never require payment. Full-length mastering,
          stem separation, and chord detection are paid — either as one-time credits (see current pricing in the app
          under Settings → Billing) or unlimited via the All-Access monthly subscription. This policy covers both.
        </p>
      </section>

      <section>
        <h2>2. One-time purchases (master/chords/stem-separation credits)</h2>
        <p>You're eligible for a full refund of a credit purchase if:</p>
        <ul>
          <li>You request it within <strong>14 days</strong> of the charge; and</li>
          <li>The credit hasn't been used yet — once a credit is spent on a render or analysis, the compute cost has already been incurred and that specific credit is non-refundable (see Section 4).</li>
        </ul>
        <p>Unused credits don't expire, so there's no rush to use them before deciding whether to keep them.</p>
      </section>

      <section>
        <h2>3. All-Access subscription</h2>
        <p>
          If you subscribe and decide it's not for you, request a refund of your <strong>most recent charge</strong>{" "}
          within 14 days of that charge, provided you haven't substantially used the subscription in that period
          (e.g. run several full-length masters or chord analyses that would otherwise have cost individual
          credits). Cancelling stops future renewals immediately (Settings → Billing → Manage billing) but doesn't
          by itself refund the current period — request that separately if you want it.
        </p>
      </section>

      <section>
        <h2>4. What isn't refundable</h2>
        <ul>
          <li>A credit already spent on a completed render or chord analysis, once you have the result — the underlying compute cost has already been incurred;</li>
          <li>Requests made more than 14 days after the relevant charge;</li>
          <li>Charges resulting from a violation of our <a href="/terms" className="text-brass hover:text-ember">Terms &amp; Conditions</a>.</li>
        </ul>
      </section>

      <section>
        <h2>5. How to request a refund</h2>
        <p>
          Email <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>{" "}
          with your account email and the date of the charge. We aim to respond within 5 business days. Refunds are
          processed back through Polar, our payment processor, to your original payment method.
        </p>
      </section>

      <section>
        <h2>6. Changes to this policy</h2>
        <p>
          We may update this Refund Policy as our pricing evolves — check back before making a purchase. Material
          changes will be reflected in the &quot;Last updated&quot; date above.
        </p>
      </section>
    </LegalPage>
  );
}
