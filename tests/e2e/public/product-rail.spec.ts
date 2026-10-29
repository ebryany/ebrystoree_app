import { expect, test } from "@playwright/test";

for (const width of [320, 375, 390, 430]) {
  test(`homepage products respond to a native touch swipe at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    try {
      await page.goto("/");
      const rail = page.getByRole("region", { name: "Daftar produk digital", exact: true });
      await expect(rail).toBeVisible();
      expect(await rail.locator("article").count()).toBeGreaterThan(1);
      await rail.scrollIntoViewIfNeeded();
      const overflow = await rail.evaluate((element) => ({
        available: element.scrollWidth > element.clientWidth,
        snap: getComputedStyle(element).scrollSnapType,
      }));
      expect(overflow.available).toBe(true);
      expect(overflow.snap).toContain("x");
      const box = (await rail.boundingBox())!;
      const session = await context.newCDPSession(page);
      await session.send("Input.synthesizeScrollGesture", {
        x: Math.round(box.x + box.width * 0.75),
        y: Math.round(box.y + 70),
        xDistance: -220,
        yDistance: 0,
        speed: 500,
        gestureSourceType: "touch",
      });
      await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(20);
      await expect(page).toHaveURL(/\/$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await context.close();
    }
  });
}

for (const width of [768, 1024, 1440]) {
  test(`desktop product presentation remains available at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const section = page.locator('[aria-labelledby="produk-heading"]');
    await expect(section.getByRole("region", { name: "Daftar produk digital" })).toBeHidden();
    await expect(section.locator("article:visible").first()).toBeVisible();
    await expect(page.getByRole("img", { name: "Maskot Ebrystore membawa laptop" })).toBeVisible();
  });
}

test("mobile rail retains cart and purchase destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  const rail = page.getByRole("region", { name: "Daftar produk digital", exact: true });
  const card = rail.locator("article").first();
  await expect(card.getByRole("link", { name: "Beli langsung", exact: true })).toHaveAttribute(
    "href",
    /\/checkout\/produk\/.+/,
  );
  await card.getByRole("button", { name: /Tambah .* ke keranjang/ }).click();
  await expect(page.getByText("Ditambahkan ke keranjang.", { exact: true })).toBeVisible();
});
