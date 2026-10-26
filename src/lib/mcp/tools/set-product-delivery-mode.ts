import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "set_product_delivery_mode",
  title: "Atur mode pengiriman produk",
  description:
    "Mengubah mode pengiriman produk digital: 'shared' (semua pembeli mengunduh berkas versi aktif yang sama) atau 'unique' (setiap pembeli mendapat satu berkas stok berbeda). Berkas nonaktif tidak diaktifkan otomatis.",
  inputSchema: {
    product_id: z.string().uuid().describe("ID produk digital."),
    mode: z.enum(["shared", "unique"]).describe("Mode pengiriman baru."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ product_id, mode }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("digital_products")
      .update({ delivery_mode: mode })
      .eq("id", product_id)
      .select("id, name, delivery_mode, available_stock")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Produk tidak ditemukan atau akun tidak punya izin mengubahnya.");

    await supabase.rpc("write_audit_log", {
      _action: "product.delivery_mode",
      _entity_type: "digital_product",
      _entity_id: product_id,
      _before: null,
      _after: { delivery_mode: mode, source: "mcp" },
      _reason: null,
      _ip: null,
      _trace_id: null,
    });

    return jsonResult({ updated: data });
  },
});
