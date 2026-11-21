import { describe, expect, it, vi } from "vitest";
vi.mock("../public-catalog.server", () => ({
  readCatalogCategories: vi.fn(),
  readCatalogProducts: vi.fn(),
  readCatalogProduct: vi.fn(),
}));
import { handleCatalogRequest } from "../catalog-api.server";

function source() {
  return {
    categories: vi.fn().mockResolvedValue({ items: [], error: null }),
    products: vi.fn().mockResolvedValue({ items: [], error: null, page: 0, nextPage: null }),
    product: vi.fn().mockResolvedValue({ product: null, error: null }),
  };
}
const req = (path: string) => new Request(`https://example.test/api/v1/catalog/${path}`);

describe("catalog HTTP v1", () => {
  it("uses shared product reader with bounded pagination and search", async () => {
    const s = source();
    const response = await handleCatalogRequest(req("products?q=software&pageSize=12&page=1"), s);
    expect(response.status).toBe(200);
    expect(s.products).toHaveBeenCalledWith({ q: "software", pageSize: 12, page: 1 });
    expect(await response.json()).toEqual({
      data: { items: [], page: 0, pageSize: 12, nextPage: null },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    "page=-1",
    "page=1.5",
    "pageSize=49",
    "pageSize=0",
    "q=" + "x".repeat(81),
    "page=0&page=1",
    "private=true",
  ])("rejects invalid query %s before database access", async (query) => {
    const s = source();
    expect((await handleCatalogRequest(req(`products?${query}`), s)).status).toBe(400);
    expect(s.products).not.toHaveBeenCalled();
  });
  it("restricts category reads to product categories", async () => {
    const s = source();
    expect((await handleCatalogRequest(req("categories"), s)).status).toBe(200);
    expect(s.categories).toHaveBeenCalledWith({ kind: "product" });
    expect((await handleCatalogRequest(req("categories?kind=private"), s)).status).toBe(400);
  });
  it("distinguishes missing products from failed queries without exposing errors", async () => {
    const s = source();
    expect((await handleCatalogRequest(req("products/missing"), s)).status).toBe(404);
    s.product.mockRejectedValueOnce(new Error("private credential"));
    const result = await handleCatalogRequest(req("products/missing"), s);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private credential");
  });
  it("rejects encoded separators, malformed encoding and write methods", async () => {
    const s = source();
    expect((await handleCatalogRequest(req("products/a%2Fb"), s)).status).toBe(400);
    expect((await handleCatalogRequest(req("products/%ZZ"), s)).status).toBe(400);
    expect(
      (await handleCatalogRequest(new Request(req("products"), { method: "POST" }), s)).status,
    ).toBe(405);
    expect(s.product).not.toHaveBeenCalled();
  });
  it("keeps unavailable catalog distinct from an empty catalog", async () => {
    const s = source();
    s.products.mockResolvedValueOnce({
      items: [],
      error: "backend failure",
      page: 0,
      nextPage: null,
    });
    expect((await handleCatalogRequest(req("products"), s)).status).toBe(503);
  });
});
