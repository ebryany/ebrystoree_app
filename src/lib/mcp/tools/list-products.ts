import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_digital_products",
  title: "Daftar produk digital",
  description:
    "Menampilkan daftar produk digital beserta harga, status, stok tersedia, dan jumlah terjual. Bisa dicari dan difilter per status.",
  inputSchema: {
    search: z.string().trim().max(120).optional().describe("Kata kunci nama produk."),
    status: z.enum(["all", "draft", "published", "archived"]).optional().describe("Filter status produk."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("digital_products")
      .select(
        "id, name, slug, status, price, discount_price, currency, delivery_mode, available_stock, sold_count, download_limit, validity_days, updated_at",
      )
      .is("deleted_at", null);
    if (search) query = query.ilike("name", `%${search}%`);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});