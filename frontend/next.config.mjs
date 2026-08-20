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
