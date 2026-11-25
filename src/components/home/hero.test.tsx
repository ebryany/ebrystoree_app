import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    ...props
  }: ComponentProps<"a"> & { to: string; search?: unknown }) =>
    createElement("a", { ...props, href: to }),
  useRouterState: (opts?: { select?: (s: unknown) => unknown }) => {
    const routerState = { matches: [{ loaderData: { values: state.settings } }] };
    return opts?.select ? opts.select(routerState) : routerState;
  },
}));

import { HomeHero } from "./hero";
import { ShimmerButton } from "@/components/ui/shimmer-button";

beforeEach(() => {
  state.settings = null;
});

describe("HomeHero (gaya marketplace Tokopedia x Itemku)", () => {
  const renderHero = () => renderToStaticMarkup(<HomeHero />);

  it("renders one visible heading, quick marketplace links, and real guarantees when no banners uploaded", () => {
    const html = renderHero();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="hero-heading"');
    expect(html).toContain("Marketplace produk digital &amp; jasa");
    expect(html).toContain('href="/produk"');
    expect(html).toContain('href="/layanan"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/auth"');
    expect(html).toContain("Pembayaran diverifikasi");
    expect(html).toContain("Dana jasa ditahan sampai hasil diterima");
    expect(html).toContain("Toko ditinjau sebelum tayang");
    expect(html).toContain('fetchPriority="high"');
    expect(html).not.toMatch(/min-h-screen|h-screen|100vh|—/);
  });

  it("renders accessible native scroll-snap promo carousel with LCP fetchPriority when banners exist", () => {
    const u1 = "0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f";
    const u2 = "1f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f";
    state.settings = {
      home_banner_image_url: `/api/public/catalog-image/branding/home/${u1}.png`,
      home_banner_mobile_image_url: `/api/public/catalog-image/branding/home/${u1}.webp`,
      home_banner_alt: "Promo Ebrystore",
      home_banner_slides: [
        {
          imageUrl: `/api/public/catalog-image/branding/home/${u2}.png`,
          mobileUrl: "",
          alt: "Promo Kedua",
        },
      ],
    };
    const html = renderHero();
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-roledescription="slide"');
    expect(html).toContain('aria-label="Slide 1 dari 2"');
    expect(html).toContain('aria-label="Slide 2 dari 2"');
    expect(html).toContain('aria-label="Slide promo sebelumnya"');
    expect(html).toContain('aria-label="Slide promo berikutnya"');
    expect(html).toContain('aria-label="Pilih slide promo"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('fetchPriority="low"');
    expect(html).toContain('loading="lazy"');
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
