import { describe, expect, it } from "vitest";

import {
  filterSellerReport,
  marketplaceOverviewSchema,
  marketplaceSellerSchema,
  type MarketplaceSellerRow,
} from "@/lib/marketplace-report";

describe("marketplace report schemas", () => {
  it("menolak ringkasan tidak lengkap alih-alih mengubahnya menjadi nol", () => {
    expect(marketplaceOverviewSchema.safeParse({ gmv: 0 }).success).toBe(false);
    expect(marketplaceOverviewSchema.safeParse(null).success).toBe(false);
  });

  it("menerima angka PostgreSQL dalam bentuk string", () => {
    const row = marketplaceSellerSchema.parse({
      store_id: "11111111-1111-4111-8111-111111111111",
      store_name: "Fixture",
      products_published: "2",
      orders_paid: "3",
      sales_amount: "1000",
      rating_average: "4.5",
    });
    expect(row.sales_amount).toBe(1000);
    expect(row.rating_average).toBe(4.5);
  });

  it("menolak nilai uang tidak valid", () => {
    const row = {
      store_id: "11111111-1111-4111-8111-111111111111",
      store_name: "Fixture",
      products_published: 0,
      orders_paid: 0,
      rating_average: 0,
    };
    for (const sales_amount of [null, "", "invalid", Infinity]) {
      expect(marketplaceSellerSchema.safeParse({ ...row, sales_amount }).success).toBe(false);
    }
  });
});

const sellers: MarketplaceSellerRow[] = [
  {
    store_id: "fixture-b",
    store_name: "Toko Beta",
    products_published: 4,
    orders_paid: 1,
    sales_amount: 200,
    rating_average: 0,
  },
  {
    store_id: "fixture-a",
    store_name: "Toko Alfa",
    products_published: 2,
    orders_paid: 3,
    sales_amount: 100,
    rating_average: 4,
  },
];

describe("filterSellerReport", () => {
  it("mencari seluruh kata tanpa membedakan kapital", () => {
    expect(filterSellerReport(sellers, "  ALFA toko ", "sales").map((row) => row.store_id)).toEqual(
      ["fixture-a"],
    );
  });

  it("mengembalikan kosong jika kata tidak cocok", () => {
    expect(filterSellerReport(sellers, "tidak ada", "sales")).toEqual([]);
  });

  it.each([
    ["sales", "fixture-b"],
    ["orders", "fixture-a"],
    ["products", "fixture-b"],
    ["name", "fixture-a"],
  ] as const)("mengurutkan berdasarkan %s", (sort, id) => {
    expect(filterSellerReport(sellers, "", sort)[0].store_id).toBe(id);
  });

  it("tidak mengubah urutan data sumber", () => {
    filterSellerReport(sellers, "", "name");
    expect(sellers[0].store_id).toBe("fixture-b");
  });

  it("mengurutkan nilai setara berdasarkan nama", () => {
    const tied = sellers.map((row) => ({ ...row, sales_amount: 0 }));
    expect(filterSellerReport(tied, "", "sales")[0].store_id).toBe("fixture-a");
  });
});
