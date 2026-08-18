/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone build (a minimal server +
  // only the node_modules actually used) — the Docker image copies that
  // instead of the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
