const portalBuild = process.env.PACKWORKS_PORTAL_BUILD === "1";
const staticBuild = process.env.PACKWORKS_STATIC_BUILD === "1";
// Test-channel build: same portal export, served under /games/packs/test so
// experimental builds can be played on herm.cool without touching the live game.
const testBuild = process.env.PACKWORKS_TEST_BUILD === "1";

const basePath = testBuild ? "/games/packs/test" : portalBuild ? "/games/packs" : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: portalBuild || staticBuild || testBuild ? "export" : undefined,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_PACKWORKS_BASE: basePath,
  },
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
