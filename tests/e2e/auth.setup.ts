import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";

export const STORAGE_STATE = "tests/e2e/.auth/user.json";

/**
 * Menyiapkan sesi login untuk skenario terautentikasi.
 * Sesi diambil dari environment (disediakan runner) agar kredensial tidak pernah masuk repo.
 */
setup("siapkan sesi pengguna", async ({ page, context }) => {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

  setup.skip(!storageKey || !sessionJson, "Sesi pengguna tidak tersedia di environment.");

  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({ ...c, url: baseURL }));
    await context.addCookies(cookies);
  }

  await page.goto(baseURL);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [storageKey!, sessionJson!],
  );

  if (!existsSync(dirname(STORAGE_STATE))) mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
});