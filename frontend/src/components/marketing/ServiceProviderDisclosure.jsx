import Link from "next/link";

// These marks identify actual service providers, not customer endorsements.
// Only Cloudflare's official customer web badge is displayed as third-party logo
// artwork; other vendors are named typographically to avoid unauthorized logo use.
// Do not add streaming-platform logos here: compatibility is not a partnership.
export default function ServiceProviderDisclosure() {
  return (
    <section aria-labelledby="service-providers-title" className="reveal mt-16 border-y border-border-subtle py-9">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-[45ch]">
          <h2 id="service-providers-title" className="m-0 font-[var(--font-title)] text-[20px] font-semibold tracking-tight text-text-primary">
            The services behind Auralith
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Secure delivery, checkout and licensed editorial photography. These are service-provider
            references, not endorsements of our mastering quality.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <a href="https://www.cloudflare.com/" rel="noopener noreferrer" target="_blank" aria-label="Cloudflare: website delivery and protection" className="inline-flex items-center">
            {/* Unmodified official Cloudflare customer web badge. */}
            <img src="https://www.cloudflare.com/img/logo-web-badges/cf-logo-on-white-bg.svg" alt="Cloudflare" width="112" height="34" loading="lazy" className="h-[34px] w-auto max-w-[112px] object-contain" />
          </a>
          <a href="https://polar.sh/" rel="noopener noreferrer" target="_blank" aria-label="Polar: checkout provider" className="inline-flex items-center text-[19px] font-semibold tracking-[-0.04em] text-text-primary">
            Polar
          </a>
          <a href="https://www.pexels.com/" rel="noopener noreferrer" target="_blank" aria-label="Pexels: source of licensed editorial photographs" className="inline-flex items-center text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
            Pexels
          </a>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Third-party names and marks belong to their respective owners. No sponsorship or affiliation
        with music streaming platforms is claimed. <Link href="/terms" className="underline underline-offset-2">Trademark details</Link>.
      </p>
    </section>
  );
}
