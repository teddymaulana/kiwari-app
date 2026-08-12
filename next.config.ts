import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns a Node worker_threads worker and resolves its
  // worker script / wasm files via require.resolve — bundling it breaks
  // that resolution (the recognize() call hangs). Use native require
  // instead.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
