import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "review_refund",
  title: "Putuskan / proses refund",
  description:
    "Menyetujui atau menolak permintaan refund, atau menandai refund sudah dibayarkan dengan nomor referensi transfer.",
  inputSchema: {
    refund_id: z.string().uuid().describe("ID refund."),
    action: z.enum(["approve", "reject", "request_info", "process"]).describe("approve/reject/request_info = keputusan, process = tandai sudah ditransfer."),
    reason: z.string().trim().max(500).optional().describe("Catatan keputusan (wajib untuk penolakan)."),
    reference: z.string().trim().max(120).optional().describe("Nomor referensi transfer (untuk action process)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ refund_id, action, reason, reference }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    if (action === "process") {
      if (!reference) return errorResult("Nomor referensi transfer wajib diisi.");
      const { data, error } = await supabase.rpc("process_refund", { _refund_id: refund_id, _reference: reference });
      if (error) return errorResult(error.message);
      return jsonResult({ result: data });
    }
    if (action === "reject" && !reason) return errorResult("Alasan wajib diisi saat menolak refund.");
    const { data, error } = await supabase.rpc("review_refund", {
      _refund_id: refund_id,
      _decision: action,
      _reason: reason ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
