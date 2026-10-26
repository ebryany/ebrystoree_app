import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "Daftar kategori",
  description: "Menampilkan kategori produk/layanan beserta ID-nya untuk dipakai saat menambah produk.",
  inputSchema: {
    kind: z.enum(["all", "product", "service"]).optional().describe("Filter jenis kategori."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("categories")
      .select("id, name, slug, kind, is_active, sort_order")
      .is("deleted_at", null);
    if (kind && kind !== "all") query = query.eq("kind", kind);
    const { data, error } = await query.order("sort_order", { ascending: true });
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
