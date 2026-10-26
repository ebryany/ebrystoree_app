// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Plugin MCP membandingkan path tanpa menormalkan pemisah direktori, sehingga gagal
// di Windows (parent "C:/..." vs child "C:\..."). Nonaktifkan secara default agar dev
// lokal tetap jalan; set ENABLE_MCP_PLUGIN=1 untuk menyalakan (mis. di Linux/produksi).
const enableMcpPlugin = process.env.ENABLE_MCP_PLUGIN === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: enableMcpPlugin ? [mcpPlugin()] : [],
  },
});
