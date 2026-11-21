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

describe("CategoryRail icon image", () => {
  it("renders the uploaded PNG/JPEG inside a unified framed badge instead of the built-in icon", () => {
    state.items = [{ id: "1", name: "chatgpt", slug: "chatgpt", image_url: IMG }];
    const html = renderToStaticMarkup(<CategoryRail />);
    expect(html).toContain(`src="${IMG}?w=96&amp;f=webp"`);
    expect(html).toContain("object-contain");
    expect(html).toContain("rounded-[13px]");
    expect(html).toContain("ChatGPT");
    expect(html).toContain('role="list"');
    expect(html).not.toContain("fetchpriority");
  });

  it("falls back to the built-in icon badge when the image is missing or unsafe", () => {
    for (const image_url of [null, "javascript:alert(1)", "/api/public/catalog-image/../x.png"]) {
      state.items = [{ id: "1", name: "Jasa Web", slug: "jasa-web", image_url }];
      const html = renderToStaticMarkup(<CategoryRail />);
      expect(html).not.toContain("<img");
      expect(html).toContain("<svg");
      expect(html).toContain("rounded-[13px]");
    }
  });

  it("formats category labels cleanly while preserving acronyms and Indonesian connectors", () => {
    expect(formatCategoryLabel("akun ai premium")).toBe("Akun AI Premium");
    expect(formatCategoryLabel("CHATGPT")).toBe("ChatGPT");
    expect(formatCategoryLabel("sitasi dan referensi")).toBe("Sitasi dan Referensi");
    expect(formatCategoryLabel("pemrograman akademik")).toBe("Pemrograman Akademik");
  });
});
