import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_refunds",
  title: "Daftar refund",
  description: "Menampilkan permintaan refund beserta status, nominal, alasan, dan waktu pengajuan.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filter status refund, mis. requested, approved, processed, rejected."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("refunds")
      .select(
        "id, refund_number, order_id, payment_id, amount, reason, status, requested_at, reviewed_at, decision_note, processed_at, processing_reference",
      );
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("requested_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
