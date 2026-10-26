import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Konfigurasi Vitest (unit/integration).
 *
 * Penting: folder `tests/e2e` adalah milik Playwright, BUKAN vitest.
 * Tanpa exclude ini, vitest mencoba memuat file Playwright dan gagal.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "tests/e2e/**", ".output", ".nitro"],
    environment: "node",
  },
});
