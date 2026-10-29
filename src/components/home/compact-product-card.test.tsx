import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    ...props
  }: ComponentProps<"a"> & { to: string; params?: { slug: string } }) =>
    createElement("a", { ...props, href: to.replace("$slug", params?.slug ?? "") }),
}));

import { CompactProductCard } from "./compact-product-card";

const item = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Template uji",
  slug: "template-uji",
  short_description: null,
  thumbnail_url: null,
  price: 100000,
  discount_price: 80000,
  store_name: "Toko uji",
};

describe("Homepage compact product rail", () => {
  it("keeps the real detail/checkout destinations and accessible cart action", () => {
    const html = renderToStaticMarkup(<CompactProductCard item={item} />);
    expect(html).toContain('href="/produk/template-uji"');
    expect(html).toContain('href="/checkout/produk/template-uji"');
    expect(html).toContain('aria-label="Tambah Template uji ke keranjang"');
    expect(html).toContain("size-11");
    expect(html).toContain("Beli langsung");
    expect(html).toContain("Toko uji");
  });

  it("preserves the existing discount calculation and SSR-safe image fallback", () => {
    const html = renderToStaticMarkup(<CompactProductCard item={item} />);
    expect(html).toContain("-20%");
    expect(html).toContain("80.000");
    expect(html).toContain("100.000");
    expect(html).not.toContain("<img");
    expect(html).toContain("aspect-[4/3]");
  });

  it("does not invent a discount when the supplied discount price is invalid", () => {
    for (const discount_price of [null, 0, -1, 100000, 120000]) {
      const html = renderToStaticMarkup(<CompactProductCard item={{ ...item, discount_price }} />);
      expect(html).not.toMatch(/-\d+%/);
      expect(html).toContain("100.000");
    }
  });

  it("puts horizontal scrolling and snap on the mobile scroll container, not its list", () => {
    const source = readFileSync("src/routes/index.tsx", "utf8");
    const rail = source.slice(source.indexOf('aria-label="Daftar produk digital"'));
    expect(rail).toMatch(/className="[^"]*snap-x[^"]*overflow-x-auto[^"]*sm:hidden/);
    expect(rail).toContain('<ul className="flex w-max gap-2.5">');
    expect(rail).toContain("<CompactProductCard item={item} />");
    expect(rail).toContain("sm:block");
  });
});
