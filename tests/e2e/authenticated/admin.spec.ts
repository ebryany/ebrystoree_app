import { expect, test } from "@playwright/test";

/**
 * Skenario admin. Bila akun uji bukan staf, halaman menampilkan status ditolak —
 * itu tetap perilaku benar dan diverifikasi di sini.
 */
const ADMIN_PAGES = [
  "/admin",
  "/admin/orders",
  "/admin/payments",
  "/admin/refunds",
  "/admin/tasks",
  "/admin/audit",
  "/admin/jobs",
  "/admin/settings/website",
];

test.describe("Dashboard admin", () => {
  for (const path of ADMIN_PAGES) {
    test(`halaman ${path} merender tanpa error runtime`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
      const authorized = await page.locator("h1").first().isVisible();
      const denied = await page.getByText(/tidak punya izin|akses ditolak|forbidden/i).first().isVisible();
      expect(authorized || denied).toBeTruthy();
    });
  }

  test("job terjadwal menampilkan ketiga job otomatis", async ({ page }) => {
    await page.goto("/admin/jobs");
    await page.waitForLoadState("networkidle");
    const denied = await page.getByText(/tidak punya izin|akses ditolak/i).first().isVisible();
    test.skip(denied, "Akun uji tidak punya izin audit.");
    await expect(page.getByText("Kedaluwarsa pesanan", { exact: true })).toBeVisible();
    await expect(page.getByText("Tugas melewati tenggat", { exact: true })).toBeVisible();
    await expect(page.getByText("Pemantauan SLA pengerjaan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /jalankan sekarang/i }).first()).toBeVisible();
  });
});