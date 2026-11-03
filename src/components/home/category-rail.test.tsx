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

import { CategoryRail } from "./category-rail";

const IMG = "/api/public/catalog-image/categories/0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f.png";

beforeEach(() => {
  state.items = [];
});

describe("CategoryRail icon image", () => {
  it("renders the uploaded PNG/JPEG instead of the built-in icon", () => {
    state.items = [{ id: "1", name: "Jasa Web", slug: "jasa-web", image_url: IMG }];
    const html = renderToStaticMarkup(<CategoryRail />);
    expect(html).toContain(`src="${IMG}"`);
    expect(html).toContain("object-contain");
  });

  it("falls back to the built-in icon when the image is missing or unsafe", () => {
    for (const image_url of [null, "javascript:alert(1)", "/api/public/catalog-image/../x.png"]) {
      state.items = [{ id: "1", name: "Jasa Web", slug: "jasa-web", image_url }];
      const html = renderToStaticMarkup(<CategoryRail />);
      expect(html).not.toContain("<img");
      expect(html).toContain("<svg");
    }
  });
});
