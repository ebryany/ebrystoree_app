import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    ...props
  }: ComponentProps<"a"> & { to: string; search?: unknown }) =>
    createElement("a", { ...props, href: to }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({ data: { items: [] } }),
}));
vi.mock("@/lib/catalog.functions", () => ({ listCatalogCategories: vi.fn() }));

import { HomeHero } from "./hero";
import { ShimmerButton } from "@/components/ui/shimmer-button";

describe("HomeHero (gaya toko modern)", () => {
  const renderHero = () => renderToStaticMarkup(<HomeHero />);

  it("renders one heading with both animated words", () => {
    const html = renderHero();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="hero-heading"');
    expect(html).toContain("Belanja di Ebrystore");
    expect(html).toContain("produk digital, jasa");
  });

  it("puts a labelled search form first, submitting to the product catalogue", () => {
    const html = renderHero();
    expect(html).toContain('role="search"');
    expect(html).toContain('for="hero-search"');
    expect(html).toContain('id="hero-search"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("min-h-11");
  });

  it("lists only real guarantees and keeps the mascot desktop-only", () => {
    const html = renderHero();
    expect(html).toContain("Pembayaran diverifikasi");
    expect(html).toContain("Toko ditinjau sebelum tayang");
    expect(html).toContain('src="/images/ebrystore-hero-mascot.webp?v=bf406217"');
    expect(html).toMatch(/<div class="hidden min-w-0 justify-center lg:flex"><img\b/);
    expect(html).not.toContain("max-w-7xl");
    expect(html).not.toMatch(/min-h-screen|h-screen|100vh/);
  });
});

describe("ShimmerButton opt-in link composition", () => {
  it("preserves the default button element and its content", () => {
    const html = renderToStaticMarkup(<ShimmerButton>Continue</ShimmerButton>);
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain("Continue</button>");
    expect(html).not.toContain("<a");
  });

  it("puts the shimmer inside a single link and merges its styles without swallowing link props", () => {
    const html = renderToStaticMarkup(
      <ShimmerButton asChild className="min-h-12" background="#ffffff">
        <a href="/produk" className="font-semibold" aria-label="Jelajahi produk">
          Jelajahi produk
        </a>
      </ShimmerButton>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/produk"');
    expect(html).toContain('aria-label="Jelajahi produk"');
    expect(html).toContain("min-h-12");
    expect(html).toContain("font-semibold");
    expect(html).toContain("animate-shimmer-slide");
    expect(html).toContain("inset-[var(--cut)]");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="button"');
  });
});
