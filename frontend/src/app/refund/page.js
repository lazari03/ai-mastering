import LegalPage from "@/components/legal/LegalPage";
import { buildMetadata } from "@/lib/seo";
import { PRODUCT } from "@/lib/product";
import { PLANS, SINGLE_MASTER, STEM_SEPARATION } from "@/lib/pricing";

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
        <h2>1. What&apos;s paid</h2>
        <p>
          Mastering previews, chord/key/BPM detection and {PRODUCT.freeMasters} full-length masters (a one-time free
          trial that never renews) never require payment. Paid options are the {PLANS.indie.label},{" "}
          {PLANS.studio.label} and {PLANS.pro.label} subscriptions (billed monthly or annually), and one-time{" "}
          {SINGLE_MASTER.label} and {STEM_SEPARATION.label} credits. See current prices on the{" "}
          <a href="/pricing">pricing page</a>. This policy covers all of them.
        </p>
      </section>

      <section>
        <h2>2. Subscriptions</h2>
        <p>
          If a subscription isn&apos;t for you, request a refund of your <strong>most recent charge</strong> within 14
          days of that charge, provided you haven&apos;t substantially used the plan in that period (for example, run
          several full-length masters or used stem separation). This applies to monthly and annual billing.
          Cancelling stops future renewals (Settings → Billing → Manage billing) but doesn&apos;t by itself refund
          the current period — request that separately if you want it.
        </p>
      </section>

      <section>
        <h2>3. One-time credits</h2>
        <p>
          An unused {SINGLE_MASTER.label} or {STEM_SEPARATION.label} credit can be refunded within 14 days of
          purchase. A credit that has been used to render a master has been delivered and is not refundable. If a
          render fails, the credit is not consumed — try again, or contact us if it was.
        </p>
      </section>

      <section>
        <h2>4. What isn&apos;t refundable</h2>
        <ul>
          <li>Requests made more than 14 days after the relevant charge;</li>
          <li>A subscription period you&apos;ve substantially used, or a credit you&apos;ve used (see Sections 2–3);</li>
          <li>Charges resulting from a violation of our <a href="/terms">Terms &amp; Conditions</a>.</li>
        </ul>
        <p>
          <strong>EU/EEA/UK consumers:</strong> you normally have a 14-day right to withdraw from an online purchase.
          Because the Service is digital and delivered on request, you agree when you start a paid master that
          delivery begins immediately, and you acknowledge that the right of withdrawal ends for what has been
          delivered. This policy gives you at least the same 14 days for anything not yet used.
        </p>
      </section>

      <section>
        <h2>5. How to request a refund</h2>
        <p>
          Email <a href="mailto:studio@auralithforge.app">studio@auralithforge.app</a>{" "}
          with your account email and the date of the charge. We aim to respond within 5 business days. Refunds are
          processed through Polar, our payment provider and merchant of record, back to your original payment method.
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
