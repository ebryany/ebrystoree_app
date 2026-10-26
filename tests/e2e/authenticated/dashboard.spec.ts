import { expect, test } from "@playwright/test";

test.describe("Dashboard pengguna", () => {
  test("dashboard utama terbuka setelah login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("riwayat pesanan memuat daftar atau empty state", async ({ page }) => {
    await page.goto("/dashboard/pesanan");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/pesanan/);
    await expect(page.getByText(/pesanan/i).first()).toBeVisible();
  });

  test("produk saya dapat diakses", async ({ page }) => {
    await page.goto("/dashboard/produk-saya");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("pengaturan akun dapat diakses", async ({ page }) => {
    await page.goto("/dashboard/pengaturan");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});