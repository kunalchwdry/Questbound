import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandboxed live-preview host to use dev resources (HMR, source
  // maps). The platform proxies the app at https://{port}-{sandbox}.e2b.app.
  allowedDevOrigins: [
    "3000-imzafhtr4lhckhesk8rzm.e2b.app",
    ".e2b.app",
  ],
};

export default nextConfig;
