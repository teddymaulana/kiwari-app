import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns a Node worker_threads worker and resolves its
  // worker script / wasm files via require.resolve — bundling it breaks
  // that resolution (the recognize() call hangs). Use native require
  // instead.
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/extract-receipt": [
      // Bundle the OCR language data into the deployed function so it's
      // read straight off local disk instead of downloaded from a CDN on
      // every cold start — that download was slow/unreliable enough on
      // Vercel to blow past the route's 60s maxDuration (see route.ts
      // langPath).
      "./tessdata/**/*",
      // tesseract.js spawns its actual worker via `new Worker(workerPath)`
      // with a runtime-computed path — Vercel's automatic file tracer
      // can't follow that dynamic spawn, so it silently drops the entire
      // worker-script subtree (and everything it requires) from the
      // deployed function, causing "Cannot find module" at runtime. Force
      // it all in explicitly instead.
      //
      // Include every tesseract.js-core WASM variant (~43MB), not just the
      // LSTM-only ones this app requests — worker-script/index.js passes
      // its boolean `lstmOnly` flag into getCore(oem, ...), whose param is
      // actually compared against numeric OEM constants
      // ([OEM.DEFAULT, OEM.LSTM_ONLY].includes(oem)), so a boolean never
      // matches and it silently falls through to the non-LSTM variant
      // regardless of what mode was requested. This only ever worked
      // locally because every variant happens to exist in full local
      // node_modules — trimming to just "*lstm*" (as this used to do)
      // breaks in production the moment that fallthrough fires.
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/zlibjs/**/*",
      // sharp's native binary lives in a separate per-platform package
      // (@img/sharp-<platform> / @img/sharp-libvips-<platform>) that npm
      // resolves to whatever matches the actual build machine — Vercel's
      // own build installs the Linux binary here even though only a
      // macOS one is present locally, so this glob picks up the right
      // one at each respective build time.
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
    ],
  },
};

export default nextConfig;
