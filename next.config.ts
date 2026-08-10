import type { NextConfig } from "next";

import { DRIVE_PUBLIC_BASE_PATH } from "./src/lib/config/drive-public-path";

const nextConfig: NextConfig = {
  assetPrefix: DRIVE_PUBLIC_BASE_PATH || undefined,
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
