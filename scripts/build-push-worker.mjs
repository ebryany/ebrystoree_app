/**
 * Builds the isolated Firebase Push Realtime Worker into a single standalone ESM bundle
 * (`dist/push-worker/firebase-push-worker.mjs`) using Vite's built-in Rolldown/esbuild bundler.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const outDir = resolve(process.cwd(), "dist/push-worker");
mkdirSync(outDir, { recursive: true });

await build({
  configFile: false,
  publicDir: false,
  logLevel: "info",
  resolve: {
    alias: {
      "@": resolve(process.cwd(), "src"),
    },
  },
  ssr: {
    noExternal: true,
    target: "node",
  },
  build: {
    ssr: resolve(process.cwd(), "src/services/firebase-push/worker.ts"),
    outDir,
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: "firebase-push-worker.mjs",
        format: "esm",
        codeSplitting: false,
      },
    },
  },
});

console.log(`Built isolated push worker: ${resolve(outDir, "firebase-push-worker.mjs")}`);
