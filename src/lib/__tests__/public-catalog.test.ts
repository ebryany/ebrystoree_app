import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), presence: vi.fn() }));
vi.mock("../supabase-public.server", () => ({ createPublicClient: mocks.client }));
vi.mock("../store-presence", () => ({ readPresenceMap: mocks.presence }));
vi.mock("../store-card.server", () => ({
  loadStoreCard: vi.fn().mockResolvedValue({ seller: null, sellerStats: null }),
}));
import {
  readCatalogCategories,
  readCatalogProduct,
  readCatalogProducts,
} from "../public-catalog.server";

describe("shared public catalog readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.presence.mockResolvedValue(new Map());
  });
  it("passes bounded search parameters to the existing FTS RPC and returns continuation", async () => {
    const rows = [{ id: "product-1", name: "Product", slug: "product", price: 10000 }];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const query = { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
    mocks.client.mockReturnValue({ rpc, from: vi.fn(() => query) });
    const result = await readCatalogProducts({
      q: "test",
      category: "software",
      page: 2,
      pageSize: 1,
    });
    expect(rpc).toHaveBeenCalledWith("search_products_fts", {
      _query: "test",
      _category_slug: "software",
      _store_slug: "",
      _limit: 1,
      _offset: 2,
    });
    expect(result.nextPage).toBe(3);
    expect(result.items[0].slug).toBe("product");
  });
  it("does not turn an FTS failure into a successful empty page", async () => {
    mocks.client.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }),
    });
    const result = await readCatalogProducts({ page: 0, pageSize: 24 });
    expect(result.error).not.toBeNull();
    expect(result.nextPage).toBeNull();
  });
  it("retains published/deleted guards and sorts shared variants", async () => {
    const row = {
      id: "p",
      delivery_mode: "shared",
      store_id: null,
      product_variants: [
        { id: "b", sort_order: 2 },
        { id: "a", sort_order: 1 },
      ],
    };
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    mocks.client.mockReturnValue({ from: vi.fn(() => q) });
    const result = await readCatalogProduct({ slug: "product" });
    expect(q.eq).toHaveBeenCalledWith("status", "published");
    expect(q.is).toHaveBeenCalledWith("deleted_at", null);
    expect(result.product?.variants.map((v) => v.id)).toEqual(["a", "b"]);
  });
  it("retains active category filters and compatibility fallback", async () => {
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    q.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: null, error: { message: "image_url missing" } }),
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: "c", name: "Software", slug: "software" }], error: null }),
      );
    mocks.client.mockReturnValue({ from: vi.fn(() => q) });
    const result = await readCatalogCategories({ kind: "product" });
    expect(q.eq).toHaveBeenCalledWith("kind", "product");
    expect(q.eq).toHaveBeenCalledWith("is_active", true);
    expect(q.is).toHaveBeenCalledWith("deleted_at", null);
    expect(result.items[0].image_url).toBeNull();
  });
});
