import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack inside this project. Without this explicit root, a parent
  // package-lock can make Next serve stale API route artifacts after refresh.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
