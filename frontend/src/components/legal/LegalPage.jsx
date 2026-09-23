import { Breadcrumbs, PageShell } from "@/components/site/Page";

export const LAST_UPDATED = "August 16, 2026";

const PATHS = { "Terms & Conditions": "/terms", "Privacy Policy": "/privacy", "Refund Policy": "/refund" };

// Legal pages use the reading width and the same article typography as the
// guides. Copy is untouched — only the frame changed.
export default function LegalPage({ title, children }) {
  return (
    <PageShell width="reading">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: title, href: PATHS[title] || "/" }]} />
      <header className="pt-4">
        <p className="eyebrow m-0">Legal</p>
        <h1 className="mt-4 font-[var(--font-title)] text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[48px]">
          {title}
        </h1>
        <p className="mt-3 text-[13px] text-text-secondary">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="legal-prose mt-10 text-[16px] leading-[1.75] text-[#2b2a27]">{children}</div>
    </PageShell>
  );
}
