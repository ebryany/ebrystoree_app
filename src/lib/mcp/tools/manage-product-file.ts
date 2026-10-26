import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

const BUCKET = "product-files";

export default defineTool({
  name: "manage_product_file",
  title: "Kelola berkas produk digital",
  description:
    "Mengaktifkan, menonaktifkan, atau menghapus berkas produk digital. Berkas yang sudah dialokasikan ke pembeli tidak dapat diubah atau dihapus.",
  inputSchema: {
    file_id: z.string().uuid().describe("ID berkas (lihat list_product_files)."),
    action: z.enum(["activate", "deactivate", "delete"]).describe("Tindakan pada berkas."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ file_id, action }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    const { data: file, error: readError } = await supabase
      .from("digital_product_files")
      .select("id, product_id, storage_path, version, is_active, assigned_entitlement_id")
      .eq("id", file_id)
      .maybeSingle();
    if (readError) return errorResult(readError.message);
    if (!file) return errorResult("Berkas tidak ditemukan atau akun tidak punya akses.");
    if (file.assigned_entitlement_id) return errorResult("Berkas sudah dimiliki pembeli dan tidak dapat diubah.");

    const { data: product } = await supabase
      .from("digital_products")
      .select("delivery_mode")
      .eq("id", file.product_id)
      .maybeSingle();
    const unique = (product?.delivery_mode ?? "shared") === "unique";

    if (action === "delete") {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
      const { error } = await supabase.from("digital_product_files").delete().eq("id", file_id);
      if (error) return errorResult(error.message);
    } else {
      const isActive = action === "activate";
      if (isActive && !unique) {
        await supabase.from("digital_product_files").update({ is_active: false }).eq("product_id", file.product_id);
        await supabase.from("digital_products").update({ version: file.version }).eq("id", file.product_id);
      }
      const { error } = await supabase.from("digital_product_files").update({ is_active: isActive }).eq("id", file_id);
      if (error) return errorResult(error.message);
    }

    await supabase.rpc("write_audit_log", {
      _action: `product_file.${action === "delete" ? "delete" : action === "activate" ? "activate" : "deactivate"}`,
      _entity_type: "digital_product",
      _entity_id: file.product_id,
      _before: null,
      _after: { file_id, source: "mcp" },
      _reason: null,
      _ip: null,
      _trace_id: null,
    });

    return jsonResult({ file_id, action, product_id: file.product_id, delivery_mode: unique ? "unique" : "shared" });
  },
});
