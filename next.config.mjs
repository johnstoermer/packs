const portalBuild = process.env.PACKWORKS_PORTAL_BUILD === "1";
const staticBuild = process.env.PACKWORKS_STATIC_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: portalBuild || staticBuild ? "export" : undefined,
  assetPrefix: portalBuild ? "/games/packs" : undefined,
  env: {
    NEXT_PUBLIC_PACKWORKS_BASE: portalBuild ? "/games/packs" : "",
  },
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
