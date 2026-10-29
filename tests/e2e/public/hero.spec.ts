import { expect, test } from "@playwright/test";

const heroSelector = '[aria-labelledby="hero-heading"]';
const description =
  "Belanja produk digital dan jasa dari toko terpilih. Harga jelas di depan, pembayaran terverifikasi, dan setiap pesanan bisa dipantau sampai tuntas.";
const supportingCopy =
  "Pembayaran diverifikasi sebelum pesanan diproses. Setiap toko ditinjau sebelum tayang.";

test.describe("Homepage Hero", () => {
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    test(`preserves content and touch targets without overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      const hero = page.locator(heroSelector);
      await expect(hero.locator("h1")).toContainText("Belanja di Ebrystore");
      await expect(hero.getByText(description, { exact: true })).toBeVisible();
      await expect(hero.getByText(supportingCopy, { exact: true })).toBeVisible();
      await expect(hero.locator("a")).toHaveCount(2);
      await expect(hero.locator("button")).toHaveCount(0);
      await expect(hero.locator("canvas")).toHaveCount(0);
      const mascot = hero.locator('img[alt="Maskot Ebrystore membawa laptop"]');
      await expect(mascot).toHaveAttribute("src", "/images/ebrystore-hero-mascot.webp?v=bf406217");
      if (width >= 1024) {
        await expect(mascot).toBeVisible();
        await expect
          .poll(() => mascot.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBe(1254);
      } else {
        await expect(mascot).toBeHidden();
        expect(await mascot.evaluate((image: HTMLImageElement) => image.complete)).toBe(false);
      }
      await page.evaluate(() => document.fonts.ready);

      const layout = await hero.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const content = [...element.querySelectorAll("h1, p, a")].map((child) => {
          const box = child.getBoundingClientRect();
          return {
            withinHero: box.left >= rect.left && box.right <= rect.right,
            withinHeight: box.top >= rect.top && box.bottom <= rect.bottom,
            clipped: child.scrollWidth > child.clientWidth + 1,
          };
        });
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          height: rect.height,
          centerOffset: Math.abs(
            element.firstElementChild!.getBoundingClientRect().left +
              element.firstElementChild!.getBoundingClientRect().width / 2 -
              (rect.left + rect.width / 2),
          ),
          textAlign: getComputedStyle(element.firstElementChild!).textAlign,
          content,
          targets: [...element.querySelectorAll("a")].map((link) => ({
            width: link.getBoundingClientRect().width,
            height: link.getBoundingClientRect().height,
          })),
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.centerOffset).toBeLessThanOrEqual(1);
      expect(layout.textAlign).toBe("left");
      expect(
        layout.content.every((item) => item.withinHero && item.withinHeight && !item.clipped),
      ).toBe(true);
      expect(layout.targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(
        true,
      );
      expect(layout.height).toBeLessThan(width >= 1024 ? 760 : 900);
      if (width >= 1440) expect(layout.height).toBeGreaterThanOrEqual(420);
      else if (width >= 1024) expect(layout.height).toBeGreaterThanOrEqual(360);
      if (width >= 1024) {
        const position = await mascot.evaluate((image) => {
          const hero = image.closest('[aria-labelledby="hero-heading"]')!;
          const copy = hero.querySelector("h1")!.parentElement!;
          const copyBox = copy.getBoundingClientRect();
          const imageBox = image.getBoundingClientRect();
          const heroBox = hero.getBoundingClientRect();
          return {
            rightOfCopy: imageBox.left >= copyBox.right,
            contained: imageBox.left >= heroBox.left && imageBox.right <= heroBox.right,
            ratio: imageBox.width / imageBox.height,
            width: imageBox.width,
          };
        });
        expect(position.contained).toBe(true);
        expect(position.ratio).toBeCloseTo(1, 2);
        expect(position.rightOfCopy).toBe(true);
        expect(position.width).toBeLessThanOrEqual(width >= 1280 ? 528 : 448);
      }
    });
  }

  test("both CTA links navigate when clicked, including the primary link padding", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const hero = page.locator(heroSelector);
    await hero.getByRole("link", { name: "Jelajahi produk", exact: true }).click({
      position: { x: 8, y: 8 },
    });
    await expect(page).toHaveURL(/\/produk(?:\?.*)?$/);
    await expect(page.locator("h1")).toBeVisible();
    await page.goto("/");
    await hero.getByRole("link", { name: "Lihat layanan", exact: true }).click();
    await expect(page).toHaveURL(/\/layanan(?:\?.*)?$/);
    await expect(page.locator("h1")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("CTA keyboard order, focus indication and Enter activation work", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(heroSelector);
    const primary = hero.getByRole("link", { name: "Jelajahi produk", exact: true });
    const secondary = hero.getByRole("link", { name: "Lihat layanan", exact: true });
    await primary.focus();
    await expect(primary).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(secondary).toBeFocused();
    expect(await secondary.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/layanan(?:\?.*)?$/);
    await page.goto("/");
    await primary.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/produk(?:\?.*)?$/);
  });

  test("words still rotate and reduced motion freezes words and shimmer", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    // SSR content can be visible while Vite is still loading the client modules.
    await page.waitForFunction(
      () => {
        const heading = document.getElementById("hero-heading");
        return heading && Object.keys(heading).some((key) => key.startsWith("__reactFiber"));
      },
      undefined,
      { timeout: 45_000 },
    );
    const word = page.locator('#hero-heading span[aria-hidden="true"]').last();
    await expect(word).toHaveText("jasa", { timeout: 15_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(word).toHaveText("produk digital");
    const hero = page.locator(heroSelector);
    await expect(hero.locator("canvas")).toHaveCount(0);
    const reduced = await hero.evaluate((element) => ({
      words: getComputedStyle(element.querySelector("h1 span[aria-hidden='true']:last-child")!)
        .animationName,
      shimmer: getComputedStyle(element.querySelector(".motion-reduce\\:hidden")!).display,
    }));
    expect(reduced.words).toBe("none");
    expect(reduced.shimmer).toBe("none");
    expect(errors).toEqual([]);
  });

  test("content reflows at 200% text size and in the existing dark theme", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      document.documentElement.classList.add("dark");
    });
    const hero = page.locator(heroSelector);
    await expect(hero.getByText(description, { exact: true })).toBeVisible();
    await expect(hero.getByText(supportingCopy, { exact: true })).toBeVisible();
    expect(await hero.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await hero.locator("h1").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(hero.getByRole("link", { name: "Jelajahi produk", exact: true })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Lihat layanan", exact: true })).toBeVisible();
  });
});
