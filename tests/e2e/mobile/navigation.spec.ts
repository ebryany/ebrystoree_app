import { expect, test } from "@playwright/test";

test.describe("Pengalaman mobile", () => {
  test("menu seluler melepas fokus dan scroll saat beralih ke desktop", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Buka menu", exact: true });
    const panel = page.getByRole("dialog").filter({ has: page.getByLabel("Tutup menu") });
    await expect(async () => {
      if (!(await panel.isVisible())) await trigger.click({ timeout: 2_000 });
      await expect(panel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(panel).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", /.+/);
    const header = page.getByRole("banner");
    await expect(header.locator('a[href="/"]')).toBeFocused();

    await page.mouse.move(650, 500);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await header
      .getByRole("navigation", { name: "Navigasi utama" })
      .locator('a[href="/produk"]')
      .click();
    await expect(page).toHaveURL(/\/produk$/);
  });

  test("beranda tidak overflow horizontal", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("katalog layanan tidak overflow horizontal", async ({ page }) => {
    await page.goto("/layanan");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
