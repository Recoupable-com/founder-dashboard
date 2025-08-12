import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure we build a server-ready app instead of attempting static export of API routes
  output: 'standalone',
  experimental: {
    esmExternals: true,
  },
  compiler: {
    styledComponents: false,
  },
};

export default nextConfig;
