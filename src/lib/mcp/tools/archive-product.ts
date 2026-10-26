import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "archive_digital_product",
  title: "Arsip / hapus produk digital",
  description:
    "Mengarsipkan produk (tidak tampil di katalog) atau menghapusnya secara lunak. Data pesanan lama tetap aman.",
  inputSchema: {
    id: z.string().uuid().describe("ID produk digital."),
    mode: z.enum(["archive", "soft_delete", "restore"]).describe("archive = sembunyikan, soft_delete = hapus lunak, restore = kembalikan sebagai draft."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, mode }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const now = new Date().toISOString();
    const patch =
      mode === "archive"
        ? { status: "archived", updated_at: now }
        : mode === "soft_delete"
          ? { status: "archived", deleted_at: now, updated_at: now }
          : { status: "draft", deleted_at: null, updated_at: now };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("digital_products")
      .update(patch)
      .eq("id", id)
      .select("id, name, slug, status, deleted_at")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Produk tidak ditemukan atau akun tidak punya izin mengubahnya.");
    return jsonResult({ product: data, mode });
  },
});
