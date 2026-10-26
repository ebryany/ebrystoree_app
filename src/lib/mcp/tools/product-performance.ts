import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "product_performance",
  title: "Performa produk & layanan",
  description:
    "Menghitung performa tiap produk/layanan dari item pesanan: jumlah terjual, omzet, dan rata-rata rating produk digital.",
  inputSchema: {
    days: z.number().int().min(1).max(365).optional().describe("Rentang hari (default 30)."),
    item_type: z.enum(["all", "digital_product", "service"]).optional().describe("Filter jenis item."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 15)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days, item_type, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const span = days ?? 30;
    const start = new Date(Date.now() - span * 86400000).toISOString();

    const { data: items, error } = await supabase
      .from("order_items")
      .select("id, order_id, item_type, product_id, service_id, name_snapshot, quantity, total, created_at")
      .gte("created_at", start);
    if (error) return errorResult(error.message);

    const filtered = (items ?? []).filter((i) =>
      !item_type || item_type === "all"
        ? true
        : item_type === "digital_product"
          ? Boolean(i.product_id)
          : Boolean(i.service_id),
    );

    const per = new Map<string, { nama: string; jenis: string; terjual: number; omzet: number; product_id: string | null }>();
    for (const i of filtered) {
      const key = i.product_id ?? i.service_id ?? i.name_snapshot;
      const bucket = per.get(key) ?? {
        nama: i.name_snapshot,
        jenis: i.product_id ? "digital_product" : i.service_id ? "service" : i.item_type,
        terjual: 0,
        omzet: 0,
        product_id: i.product_id ?? null,
      };
      bucket.terjual += Number(i.quantity ?? 1);
      bucket.omzet += Number(i.total ?? 0);
      per.set(key, bucket);
    }

    const rows = [...per.values()].sort((a, b) => b.omzet - a.omzet).slice(0, limit ?? 15);
    const { data: ratings } = await supabase.rpc("product_rating_summary");
    const ratingById = new Map<string, { average_rating: number | null; review_count: number | null }>(
      ((ratings ?? []) as any[]).map((r) => [
        String(r.product_id),
        { average_rating: r.average_rating ?? null, review_count: r.review_count ?? null },
      ]),
    );

    return jsonResult({
      periode_hari: span,
      items: rows.map((r) => ({
        ...r,
        rata_rating: r.product_id ? (ratingById.get(r.product_id)?.average_rating ?? null) : null,
        jumlah_ulasan: r.product_id ? (ratingById.get(r.product_id)?.review_count ?? 0) : null,
      })),
    });
  },
});
