import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) =>
    createElement("a", { ...props, href: to }),
}));

import { HomeHero } from "./hero";
import { ShimmerButton } from "@/components/ui/shimmer-button";

describe("HomeHero preservation", () => {
  const renderHero = () => renderToStaticMarkup(<HomeHero />);

  it("preserves the heading, both animated words, description and supporting copy in SSR", () => {
    const html = renderHero();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="hero-heading"');
    expect(html).toContain('id="hero-heading"');
    expect(html).toContain("Belanja di Ebrystore");
    expect(html).toContain("produk digital, jasa");
    expect(html).toContain(
      "Belanja produk digital dan jasa dari toko terpilih. Harga jelas di depan, pembayaran terverifikasi, dan setiap pesanan bisa dipantau sampai tuntas.",
    );
    expect(html).toContain(
      "Pembayaran diverifikasi sebelum pesanan diproses. Setiap toko ditinjau sebelum tayang.",
    );
  });

  it("keeps exactly the two original destinations as semantic links without nested controls", () => {
    const html = renderHero();
    expect(html.match(/<a\b/g)).toHaveLength(2);
    expect(html).toContain('href="/produk"');
    expect(html).toContain('href="/layanan"');
    expect(html).toContain("Jelajahi produk");
    expect(html).toContain("Lihat layanan");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="button"');
  });

  it("uses a token-based light surface while preserving word animation, shimmer and CTA icon", () => {
    const html = renderHero();
    expect(html).toContain("bg-background");
    expect(html.match(/bg-background/g)).toHaveLength(1);
    expect(html).not.toContain("color-mix");
    expect(html).not.toMatch(/elev-2|rounded-2xl|rounded-3xl|shadow-/);
    expect(html).not.toMatch(/<canvas|bg-black|from-black|backdrop-blur/);
    expect(html).toContain("word-in_360ms_ease-out");
    expect(html).toContain("animate-shimmer-slide");
    expect(html).toContain("motion-reduce:hidden");
    expect(html).toContain("lucide-chevrons-right");
  });

  it("uses content-sized responsive composition and visible keyboard focus", () => {
    const html = renderHero();
    expect(html).not.toContain("max-w-7xl");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    expect(html).not.toContain("bg-white/10");
    expect(html).toContain("sm:flex-row");
    expect(html.match(/min-h-12/g)).toHaveLength(2);
    expect(html.match(/focus-visible:ring-ring /g)).toHaveLength(2);
    expect(html).not.toMatch(/min-h-screen|h-screen|100vh/);
  });

  it("balances the content with the original mascot without decorative image framing", () => {
    const html = renderHero();
    expect(html).toContain("grid w-full py-2");
    expect(html).toContain('src="/images/ebrystore-hero-mascot.webp?v=bf406217"');
    expect(html).toContain('alt="Maskot Ebrystore membawa laptop"');
    expect(html).toContain('width="1254" height="1254"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("fetchPriority");
    expect(html).toContain("object-contain");
    expect(html).toContain("max-w-md");
    expect(html).toContain("xl:max-w-[33rem]");
    expect(html.indexOf("Pembayaran diverifikasi")).toBeLessThan(html.indexOf("<img"));
    expect(html).not.toContain("lg:text-6xl");
  });

  it("hides the mascot below lg so mobile and tablet use a single content column", () => {
    const html = renderHero();
    expect(html).toMatch(/<div class="hidden min-w-0 lg:flex lg:justify-end"><img\b/);
    expect(html).not.toMatch(/\bw-56\b|\bsm:w-64\b/);
  });

  it("adds a decorative ambient gradient behind the content without changing the base surface", () => {
    const html = renderHero();
    expect(html).toContain("relative isolate bg-background");
    expect(html).toMatch(
      /<div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 bg-\[radial-gradient\(/,
    );
    expect(html.indexOf("radial-gradient")).toBeGreaterThan(html.indexOf("<img"));
    expect(html).toContain("var(--surface-selected)");
    expect(html.match(/radial-gradient\(/g)).toHaveLength(2);
    const layer = html.match(
      /<div aria-hidden="true" class="pointer-events-none[^"]*"><\/div>/,
    )![0];
    expect(layer).not.toMatch(/blur|black|oklch\(|#[0-9a-f]{3,6}|shadow/i);
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
