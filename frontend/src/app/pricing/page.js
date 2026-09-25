import Link from "next/link";

import RelatedTools from "@/components/site/RelatedTools";
import { Breadcrumbs, Checklist, CtaBand, PageHero, PageShell, Section } from "@/components/site/Page";
import { PLANS, PLAN_ORDER, PLAN_COMPARISON, PRODUCT, SINGLE_MASTER, STEM_SEPARATION } from "@/lib/product";
import { ANNUAL_MONTHS_CHARGED } from "@/lib/pricing";
import { CTA, planSignupHref } from "@/lib/internalLinks";
import { buildMetadata, JsonLd, organizationJsonLd, SITE_NAME } from "@/lib/seo";

// A real URL for pricing (the homepage section is /#pricing, which search
// engines can't treat as its own page or sitelink). Every number comes
// from lib/pricing.js + lib/product.js — the same data the homepage grid,
// the in-app Plans panel and checkout use.
export const metadata = buildMetadata({
  title: `Pricing — Free Trial, Indie, Studio & All-Access Plans | ${SITE_NAME}`,
  description: `Start with ${PRODUCT.freeMasters} free masters, no card. Then ${PLANS.indie.label} ${PLANS.indie.price}/mo, ${PLANS.studio.label} ${PLANS.studio.price}/mo or ${PLANS.pro.label} ${PLANS.pro.price}/mo — or ${SINGLE_MASTER.price} for a single master. Chord, key and BPM detection are always free.`,
  path: "/pricing",
  keywords: ["auralith forge pricing", "ai mastering price", "online mastering cost", "mastering subscription", "pay per master"],
});

function Cell({ value }) {
  if (value === true) return <span aria-label="Included">✓</span>;
  if (value === false) return <span aria-label="Not included" className="text-text-secondary">—</span>;
  return <span>{value}</span>;
}

export default function PricingPage() {
  return (
    <PageShell width="wide">
      <JsonLd data={organizationJsonLd()} />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Pricing", href: "/pricing" }]} />

      <PageHero
        eyebrow="Pricing"
        title="Auralith Forge pricing"
        lead={`Try ${PRODUCT.freeMasters} full masters free — no card, no expiry. Pay only for mastering: every analysis tool is free, and every plan runs the same analysis-first engine.`}
        actions={
          <>
            <Link href={CTA.signup} className="btn-primary">
              Start free <span aria-hidden="true">→</span>
            </Link>
            <a href="#compare" className="btn-secondary">
              Compare plans
            </a>
          </>
        }
      />

      <section aria-labelledby="plans-title" className="mt-14">
        <h2 id="plans-title" className="sr-only">
          Plans
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const featured = key === "studio";
            return (
              <li key={key} className={`flex flex-col rounded-2xl border p-6 ${featured ? "border-text-primary bg-white" : "border-border-subtle bg-white/55"}`}>
                <h3 className="m-0 flex items-center justify-between text-[16px] font-semibold text-text-primary">
                  {plan.label}
                </h3>
                <p className="m-0 mt-3 font-[var(--font-title)] text-[36px] font-semibold tracking-[-0.02em] text-text-primary">
                  {plan.price}
                  {plan.period ? <span className="text-[15px] font-normal text-text-secondary">{plan.period}</span> : null}
                </p>
                {plan.annual ? (
                  <p className="m-0 mt-1 text-[12px] text-text-secondary">
                    or {plan.annual.price}
                    {plan.annual.period} billed yearly ({plan.annual.perMonth}/mo)
                  </p>
                ) : (
                  <p className="m-0 mt-1 text-[12px] text-text-secondary">No card required</p>
                )}
                <p className="m-0 mt-4 text-[14px] leading-[1.55] text-text-secondary">{plan.blurb}</p>
                <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-[14px] text-text-primary">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={planSignupHref(key)} className="mt-auto block pt-6">
                  <span className={featured ? "btn-primary w-full" : "btn-secondary w-full"}>{key === "free" ? "Start free" : `Choose ${plan.label}`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[13px] text-text-secondary">
          Yearly billing: {ANNUAL_MONTHS_CHARGED} months charged for 12. Prices in EUR. Monthly allowances reset each month; the free trial is one-time.
        </p>
      </section>

      <Section id="compare" title="Compare plans">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-text-primary/80 text-left">
                <th scope="col" className="py-3 pr-4 font-medium text-text-secondary">
                  <span className="sr-only">Feature</span>
                </th>
                {PLAN_ORDER.map((k) => (
                  <th key={k} scope="col" className="py-3 pr-4 font-semibold text-text-primary">
                    {PLANS[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border-subtle">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-text-primary">
                    {row.label}
                  </th>
                  {row.values.map((v, i) => (
                    <td key={PLAN_ORDER[i]} className="py-3 pr-4 text-text-primary">
                      <Cell value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Pay per track instead" intro="No subscription needed. One-time purchases sit alongside any plan.">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {[SINGLE_MASTER, STEM_SEPARATION].map((item) => (
            <li key={item.item} className="rounded-2xl border border-border-subtle bg-white/55 p-6">
              <h3 className="m-0 flex items-baseline justify-between gap-3 text-[16px] font-semibold text-text-primary">
                {item.label}
                <span className="font-[var(--font-title)] text-[24px]">{item.price}</span>
              </h3>
              <p className="m-0 mt-2 text-[14px] leading-[1.6] text-text-secondary">{item.blurb}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Every plan includes">
        <Checklist
          columns={2}
          items={[
            { title: "The same engine.", body: "Analysis first, corrections only where needed, a true-peak limiter at −1 dBTP and a verification pass — on every plan." },
            { title: "Free analysis tools.", body: "Chord Detector, Key Finder, BPM Finder, Chord Progression Finder and the LUFS Meter are free and unlimited." },
            { title: "Level-matched A/B.", body: "Compare original and master at matched loudness, so louder never wins by default." },
            { title: "Codec preview.", body: `Hear the master after ${PRODUCT.codecPreviews.join(", ")} encoding before you release.` },
            { title: "Private files.", body: `Audio is deleted ${PRODUCT.retentionHours} hours after it's created. Download what you need.` },
            { title: "Cancel any time.", body: "Cancelling stops the next renewal. See the refund policy for refunds." },
          ]}
        />
        <p className="mt-6 text-[14px]">
          <Link href="/refund" className="text-link">
            Refund policy
          </Link>
          <span className="mx-2 text-text-secondary">·</span>
          <Link href="/ai-mastering-online" className="text-link">
            How adaptive mastering works
          </Link>
        </p>
      </Section>

      <RelatedTools keys={["adaptive-mastering", "chord-detector", "lufs-meter", "bpm-finder"]} />

      <CtaBand
        title="Hear it on your own track first"
        body={`${PRODUCT.freeMasters} full masters free, no card. Upgrade only if the result earns it.`}
        primary={{ href: CTA.signup, label: "Start free" }}
        secondary={{ href: "/#how-it-listens", label: "See what the engine does" }}
      />
    </PageShell>
  );
}
