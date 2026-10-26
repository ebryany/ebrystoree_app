import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "review_job_result",
  title: "Tinjau hasil pengerjaan",
  description: "Menyetujui hasil pengerjaan operator (pesanan selesai) atau meminta revisi dengan alasan.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan jasa."),
    decision: z.enum(["approve", "revise"]).describe("approve = terima hasil, revise = minta revisi."),
    reason: z.string().trim().max(1000).optional().describe("Alasan/permintaan revisi (wajib untuk revise)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, decision, reason }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (decision === "revise" && !reason) return errorResult("Alasan revisi wajib diisi.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("review_job_result", {
      _order_id: order_id,
      _decision: decision === "revise" ? "revision" : "approve",
      _reason: reason ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
