import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "moderate_review",
  title: "Moderasi ulasan",
  description: "Menyembunyikan, menampilkan kembali, atau menghapus ulasan produk yang melanggar aturan.",
  inputSchema: {
    review_id: z.string().uuid().describe("ID ulasan."),
    action: z.enum(["hide", "show", "delete"]).describe("Aksi moderasi."),
    reason: z.string().trim().max(300).optional().describe("Alasan moderasi untuk audit log."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ review_id, action, reason }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const { data: before } = await supabase.from("product_reviews").select("*").eq("id", review_id).maybeSingle();
    if (!before) return errorResult("Ulasan tidak ditemukan atau tidak dapat diakses.");

    if (action === "delete") {
      const { data, error } = await supabase
        .from("product_reviews")
        .delete()
        .eq("id", review_id)
        .select("id");
      if (error) return errorResult(error.message);
      if (!data || data.length === 0) {
        return errorResult("Penghapusan ditolak — akun tidak punya izin menghapus ulasan.");
      }
    } else {
      const { data, error } = await supabase
        .from("product_reviews")
        .update({ is_visible: action === "show" })
        .eq("id", review_id)
        .select("id, is_visible")
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Perubahan ditolak — akun tidak punya izin moderasi ulasan.");
    }

    await supabase.rpc("write_audit_log", {
      _action: `review.${action}`,
      _entity_type: "product_reviews",
      _entity_id: review_id,
      _before: before,
      _after: action === "delete" ? null : { is_visible: action === "show" },
      _reason: reason ?? "mcp moderate_review",
      _ip: null,
      _trace_id: null,
    });
    return jsonResult({ ok: true, review_id, action });
  },
});
