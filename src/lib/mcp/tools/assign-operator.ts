import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "assign_operator",
  title: "Tugaskan operator",
  description: "Menugaskan operator ke sebuah pesanan jasa, lengkap dengan tenggat pengerjaan dan catatan internal.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan jasa."),
    operator_id: z.string().uuid().describe("ID user operator (lihat list_users dengan role operator)."),
    deadline: z.string().trim().optional().describe("Tenggat ISO, mis. 2026-08-20T10:00:00Z."),
    note: z.string().trim().max(1000).optional().describe("Catatan internal untuk operator."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, operator_id, deadline, note }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("assign_operator", {
      _order_id: order_id,
      _operator_id: operator_id,
      _deadline: deadline ?? null,
      _note: note ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
