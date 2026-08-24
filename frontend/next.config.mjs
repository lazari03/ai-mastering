// Runs once when `next build` (and `next start`) boots, in Node — the one
// place that's actually guaranteed to run before a bad deploy ships,
// unlike a runtime check in the browser which only some visitors ever
// trigger. Analytics silently going dark is exactly what happened before
// this existed: NEXT_PUBLIC_GA_MEASUREMENT_ID was baked out of a
// production image (docker-compose.yml's frontend build args read it from
// a VPS-local .env that didn't have it set) and nobody noticed for days —
// see components/Analytics.jsx, which just returns null with nothing
// logged when both providers are unset. This can't stop a bad deploy
// (analytics being optional, that would be the wrong trade-off for a lot
// of legitimate "haven't set it up yet" cases) but it makes the gap
// impossible to miss in the build log — CI's build-check job included.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && !process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
  const banner = "!".repeat(78);
  console.warn(
    `\n${banner}\n` +
      "WARNING: Building for production with NO analytics configured.\n" +
      "Neither NEXT_PUBLIC_GA_MEASUREMENT_ID nor NEXT_PUBLIC_PLAUSIBLE_DOMAIN is\n" +
      "set — this build will ship with Analytics.jsx doing nothing at all, for\n" +
      "every visitor, regardless of cookie consent. If that's not intentional,\n" +
      "set one of them in the .env docker-compose.yml reads at build time (see\n" +
      "frontend/.env.example), then rebuild — NEXT_PUBLIC_* vars are baked into\n" +
      "the JS bundle at build time, so a restart alone will NOT pick this up.\n" +
      `${banner}\n`
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone build (a minimal server +
  // only the node_modules actually used) — the Docker image copies that
  // instead of the full node_modules tree.
  output: "standalone",
  // Lets next/image optimize the Pexels photos used on the landing page
  // and blog (content/posts.js) — automatic WebP/AVIF, responsive
  // srcset, and lazy-loading below the fold, instead of a raw <img> that
  // ships one fixed-size JPEG to every device regardless of viewport.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }],
  },
};

export default nextConfig;
