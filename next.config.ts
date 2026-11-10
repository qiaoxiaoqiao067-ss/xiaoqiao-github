import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse's Node worker installs DOMMatrix via a native canvas binding.
  // Keep both packages external to Turbopack so the platform-specific binary
  // is loaded by Node instead of being embedded into an ESM server chunk.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "word-extractor"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*", "./node_modules/bmp-js/**/*", "./node_modules/wasm-feature-detect/**/*", "./node_modules/@tesseract.js-data/*/4.0.0_best_int/*.gz"],
  },
  // Keep Turbopack inside this project. Without this explicit root, a parent
  // package-lock can make Next serve stale API route artifacts after refresh.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
