import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_product_files",
  title: "Daftar berkas produk",
  description:
    "Menampilkan berkas stok sebuah produk digital: nama, versi, status aktif, dan apakah sudah dialokasikan ke pembeli. Unggah berkas baru tetap dilakukan lewat dashboard admin.",
  inputSchema: {
    product_id: z.string().uuid().describe("ID produk digital."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ product_id }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("digital_product_files")
      .select("id, original_name, version, mime_type, size_bytes, is_active, assigned_entitlement_id, assigned_at, created_at")
      .eq("product_id", product_id)
      .order("created_at", { ascending: false });
    if (error) return errorResult(error.message);
    const items = data ?? [];
    return jsonResult({
      total: items.length,
      tersedia: items.filter((f) => f.is_active && !f.assigned_entitlement_id).length,
      items,
    });
  },
});
