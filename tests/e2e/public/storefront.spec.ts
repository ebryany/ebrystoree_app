import { expect, test } from "@playwright/test";

test.describe("Storefront publik", () => {
  test("beranda tampil dengan metadata dan navigasi utama", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ebrystore/i);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
    await expect(page.getByRole("link", { name: /produk/i }).first()).toBeVisible();
  });

  test("katalog produk memuat daftar atau empty state", async ({ page }) => {
    await page.goto("/produk");
    await expect(page.locator("h1")).toContainText(/produk/i);
    await expect(page.getByRole("searchbox").or(page.getByPlaceholder(/cari/i)).first()).toBeVisible();
  });

  test("pencarian produk menyimpan kata kunci di URL", async ({ page }) => {
    await page.goto("/produk");
    await page.waitForLoadState("networkidle");
    const search = page.getByPlaceholder(/cari/i).first();
    await search.click();
    await search.pressSequentially("template", { delay: 40 });
    await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("template");
  });

  test("katalog layanan akademik memuat", async ({ page }) => {
    await page.goto("/layanan");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/joki game|game top ?up/i)).toHaveCount(0);
  });

  test("halaman artikel dan legal dapat diakses", async ({ page }) => {
    for (const path of ["/artikel", "/bantuan", "/syarat-ketentuan", "/kebijakan-privasi", "/kebijakan-refund"]) {
      const response = await page.goto(path);
      expect(response?.status(), `status ${path}`).toBeLessThan(400);
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("tidak ada error konsol serius di beranda", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !/favicon|third-party|net::ERR_/i.test(e))).toEqual([]);
  });
});