import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns a Node worker_threads worker and resolves its
  // worker script / wasm files via require.resolve — bundling it breaks
  // that resolution (the recognize() call hangs). Use native require
  // instead.
  serverExternalPackages: ["tesseract.js"],
  // Bundle the OCR language data into the deployed function so it's read
  // straight off local disk instead of downloaded from a CDN on every
  // cold start — that download was slow/unreliable enough on Vercel to
  // blow past the route's 60s maxDuration (see route.ts langPath).
  outputFileTracingIncludes: {
    "/api/extract-receipt": ["./tessdata/**/*"],
  },
};

export default nextConfig;
