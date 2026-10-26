import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "bulk_update_product_status",
  title: "Ubah status produk massal",
  description:
    "Mengubah status banyak produk digital sekaligus (arsipkan, terbitkan, atau jadikan draft) berdasarkan daftar ID produk.",
  inputSchema: {
    product_ids: z.array(z.string().uuid()).min(1).max(50).describe("Daftar ID produk (maks 50)."),
    status: z.enum(["draft", "published", "archived"]).describe("Status tujuan."),
    reason: z.string().trim().max(300).optional().describe("Alasan untuk audit log."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ product_ids, status, reason }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const ids = [...new Set(product_ids)];

    const { data: before } = await supabase.from("digital_products").select("id, name, status").in("id", ids);
    const { data, error } = await supabase
      .from("digital_products")
      .update({ status })
      .in("id", ids)
      .select("id, name, status");
    if (error) return errorResult(error.message);
    if (!data?.length) return errorResult("Tidak ada produk yang berubah — cek ID atau izin akun.");

    await supabase.rpc("write_audit_log", {
      _action: "product.bulk_status",
      _entity_type: "digital_products",
      _entity_id: null,
      _before: before ?? null,
      _after: data,
      _reason: reason ?? `mcp bulk_update_product_status -> ${status}`,
      _ip: null,
      _trace_id: null,
    });

    const missing = ids.filter((id) => !data.some((d: any) => d.id === id));
    return jsonResult({ diubah: data.length, items: data, tidak_ditemukan: missing });
  },
});
