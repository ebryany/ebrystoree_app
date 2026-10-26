import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

/** Gunakan Chromium yang sudah tersedia di lingkungan bila ada, agar tidak perlu unduh ulang. */
const localChromium = ["/chromium-1194/chrome-linux/chrome", process.env.E2E_CHROMIUM_PATH].find(
  (p): p is string => Boolean(p) && existsSync(p as string),
);
const launchOptions = localChromium ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.artifacts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { launchOptions } },
    { name: "publik", testMatch: /public\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", testMatch: /mobile\/.*\.spec\.ts/, use: { ...devices["Pixel 7"], launchOptions } },
    {
      name: "terautentikasi",
      testMatch: /authenticated\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], launchOptions, storageState: "tests/e2e/.auth/user.json" },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});