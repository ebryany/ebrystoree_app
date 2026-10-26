import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "stock_alerts",
  title: "Peringatan stok produk",
  description:
    "Menampilkan produk digital bermode stok unik yang stoknya menipis atau habis, agar bisa segera ditambah berkas stoknya.",
  inputSchema: {
    threshold: z.number().int().min(0).max(100).optional().describe("Batas stok minimum (default 3)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ threshold }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const limit = threshold ?? 3;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("digital_products")
      .select("id, name, slug, status, delivery_mode, available_stock, sold_count")
      .is("deleted_at", null)
      .eq("delivery_mode", "unique")
      .lte("available_stock", limit)
      .order("available_stock", { ascending: true });
    if (error) return errorResult(error.message);
    return jsonResult({ batas: limit, items: data ?? [] });
  },
});