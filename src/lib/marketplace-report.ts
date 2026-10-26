import { z } from "zod";

const amount = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().finite());

export const marketplaceOverviewSchema = z.object({
  stores_total: amount,
  stores_active: amount,
  stores_pending: amount,
  stores_suspended: amount,
  products_total: amount,
  products_published: amount,
  products_pending: amount,
  gmv: amount,
  seller_sales_ledger: amount,
  seller_refund_ledger: amount,
  seller_balance_total: amount,
  refunds_total: amount,
  refunds_completed_amount: amount,
  reviews_total: amount,
  last_sale_at: z.string().nullable(),
});

export const marketplaceSellerSchema = z.object({
  store_id: z.string().uuid(),
  store_name: z.string(),
  products_published: amount,
  orders_paid: amount,
  sales_amount: amount,
  rating_average: amount,
});

export type MarketplaceSellerRow = z.infer<typeof marketplaceSellerSchema>;

export type SellerReportSort = "sales" | "orders" | "products" | "name";

export function filterSellerReport(
  sellers: MarketplaceSellerRow[],
  search: string,
  sort: SellerReportSort,
) {
  const terms = search.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
  return sellers
    .filter((seller) =>
      terms.every((term) => seller.store_name.toLocaleLowerCase("id").includes(term)),
    )
    .sort((a, b) => {
      const byName = a.store_name.localeCompare(b.store_name, "id");
      if (sort === "name") return byName;
      const field =
        sort === "orders"
          ? "orders_paid"
          : sort === "products"
            ? "products_published"
            : "sales_amount";
      return Number(b[field]) - Number(a[field]) || byName;
    });
}
