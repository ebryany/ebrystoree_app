import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_reviews",
  title: "Daftar ulasan produk",
  description: "Menampilkan ulasan produk digital beserta rating, isi, nama pengulas, dan status tampil.",
  inputSchema: {
    product_id: z.string().uuid().optional().describe("Filter per produk."),
    visibility: z.enum(["all", "visible", "hidden"]).optional().describe("Filter status tampil."),
    min_rating: z.number().int().min(1).max(5).optional().describe("Rating minimum."),
    max_rating: z.number().int().min(1).max(5).optional().describe("Rating maksimum."),
    limit: z.number().int().min(1).max(100).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ product_id, visibility, min_rating, max_rating, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("product_reviews")
      .select("id, product_id, order_id, rating, title, body, reviewer_name, is_visible, created_at");
    if (product_id) query = query.eq("product_id", product_id);
    if (visibility === "visible") query = query.eq("is_visible", true);
    if (visibility === "hidden") query = query.eq("is_visible", false);
    if (min_rating) query = query.gte("rating", min_rating);
    if (max_rating) query = query.lte("rating", max_rating);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    const { data: summary } = await supabase.rpc("product_rating_summary");
    return jsonResult({ items: data ?? [], ringkasan_rating: summary ?? [] });
  },
});
