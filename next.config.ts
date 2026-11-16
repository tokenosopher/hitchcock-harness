import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the version the sidebar shows under the name (package.json's)
  env: { HARNESS_VERSION: packageJson.version },
  devIndicators: false,
  allowedDevOrigins: ['*.*.ts.net', '*.trycloudflare.com', 'localhost'],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
