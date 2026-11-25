import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ items: [] as Record<string, unknown>[] }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search: _s, ...props }: ComponentProps<"a"> & { to: string; search?: unknown }) =>
    createElement("a", { ...props, href: to }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (o: unknown) => o,
  useSuspenseQuery: () => ({ data: { items: state.items, error: null } }),
  useQuery: () => ({ data: { items: [], error: null } }),
}));
vi.mock("@/lib/catalog.functions", () => ({ listCatalogCategories: vi.fn() }));

import { CategoryRail, formatCategoryLabel } from "./category-rail";

const IMG = "/api/public/catalog-image/categories/0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f.png";

beforeEach(() => {
  state.items = [];
});

describe("CategoryRail custom 3D artwork & uploaded icon", () => {
  it("renders the uploaded PNG/JPEG inside a unified framed badge when valid", () => {
    state.items = [{ id: "1", name: "chatgpt", slug: "chatgpt", image_url: IMG }];
    const html = renderToStaticMarkup(<CategoryRail />);
    expect(html).toContain(`src="${IMG}?w=96&amp;f=webp"`);
    expect(html).toContain("object-contain");
    expect(html).toContain("rounded-[13px]");
    expect(html).toContain("ChatGPT");
    expect(html).toContain('role="list"');
    expect(html).not.toContain("fetchpriority");
  });

  it("rejects unsafe image_url and falls back safely to built-in 3D WebP artwork", () => {
    for (const image_url of [null, "javascript:alert(1)", "/api/public/catalog-image/../x.png"]) {
      state.items = [{ id: "1", name: "Jasa Web", slug: "jasa-web", image_url }];
      const html = renderToStaticMarkup(<CategoryRail />);
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("/../x.png");
      expect(html).toContain("jasa-digital.webp");
      expect(html).toContain("rounded-[13px]");
    }
  });

  it("places Semua Produk and Semua Jasa cleanly side by side at the start", () => {
    state.items = [{ id: "1", name: "Makalah", slug: "makalah", image_url: null }];
    const html = renderToStaticMarkup(<CategoryRail />);
    const idxProd = html.indexOf("Semua Produk");
    const idxServ = html.indexOf("Semua Jasa");
    const idxMakalah = html.indexOf("Makalah");
    expect(idxProd).toBeGreaterThan(-1);
    expect(idxServ).toBeGreaterThan(idxProd);
    expect(idxMakalah).toBeGreaterThan(idxServ);
  });

  it("formats category labels cleanly while preserving acronyms and Indonesian connectors", () => {
    expect(formatCategoryLabel("akun ai premium")).toBe("Akun AI Premium");
    expect(formatCategoryLabel("CHATGPT")).toBe("ChatGPT");
    expect(formatCategoryLabel("sitasi dan referensi")).toBe("Sitasi dan Referensi");
    expect(formatCategoryLabel("pemrograman akademik")).toBe("Pemrograman Akademik");
  });
});
