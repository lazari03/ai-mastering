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
          Clean Audio, mastering previews, and 3 full-length masters/month are free and never require payment.
          Everything beyond that — higher monthly mastering limits, Professional mastering, stem separation, and
          chord detection — is unlocked entirely through the Studio or All-Access monthly subscription (see current
          pricing in the app under Settings → Billing). There are no one-time purchases; this policy covers the two
          subscription plans.
        </p>
      </section>

      <section>
        <h2>2. Studio / All-Access subscriptions</h2>
        <p>
          If you subscribe to either plan and decide it's not for you, request a refund of your{" "}
          <strong>most recent charge</strong> within 14 days of that charge, provided you haven't substantially used
          the plan in that period (e.g. run several full-length masters, used stem separation, or run several chord
          analyses). Cancelling stops future renewals immediately (Settings → Billing → Manage billing) but doesn't
          by itself refund the current period — request that separately if you want it.
        </p>
      </section>

      <section>
        <h2>3. What isn't refundable</h2>
        <ul>
          <li>Requests made more than 14 days after the relevant charge;</li>
          <li>A period you've substantially used (see Section 2);</li>
          <li>Charges resulting from a violation of our <a href="/terms" className="text-brass hover:text-ember">Terms &amp; Conditions</a>.</li>
        </ul>
      </section>

      <section>
        <h2>4. How to request a refund</h2>
        <p>
          Email <a href="mailto:studio@auralithforge.app" className="text-brass hover:text-ember">studio@auralithforge.app</a>{" "}
          with your account email and the date of the charge. We aim to respond within 5 business days. Refunds are
          processed back through Polar, our payment processor, to your original payment method.
        </p>
      </section>

      <section>
        <h2>5. Changes to this policy</h2>
        <p>
          We may update this Refund Policy as our pricing evolves — check back before making a purchase. Material
          changes will be reflected in the &quot;Last updated&quot; date above.
        </p>
      </section>
    </LegalPage>
  );
}
