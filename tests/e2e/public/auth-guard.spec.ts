import { expect, test } from "@playwright/test";

const PROTECTED = [
  "/dashboard",
  "/dashboard/pesanan",
  "/dashboard/produk-saya",
  "/admin",
  "/admin/jobs",
];

/** Dashboard Pertumbuhan punya pintu masuk sendiri, jadi diarahkan ke `/see/masuk`. */
const PROTECTED_SEE = ["/see", "/see/marketing", "/see/konten", "/see/seo", "/see/kampanye"];

test.describe("Proteksi rute", () => {
  for (const path of PROTECTED) {
    test(`tamu tidak bisa membuka ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/auth/);
    });
  }

  for (const path of PROTECTED_SEE) {
    test(`tamu tidak bisa membuka ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/see\/masuk/);
    });
  }

  test("halaman auth menampilkan form masuk", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /masuk|daftar/i }).first()).toBeVisible();
  });

  test("halaman masuk pertumbuhan menampilkan form masuk", async ({ page }) => {
    await page.goto("/see/masuk");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^masuk$/i })).toBeVisible();
  });
});
