import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "hermes_take_job",
  title: "Ambil pesanan jasa",
  description:
    "Hermes mengambil sebuah pesanan jasa atas nama akun yang login: menugaskan diri sebagai operator lalu (opsional) langsung menandai pekerjaan dimulai.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan jasa."),
    deadline: z.string().trim().optional().describe("Tenggat ISO, mis. 2026-09-20T10:00:00Z."),
    note: z.string().trim().max(1000).optional().describe("Catatan internal."),
    start_now: z.boolean().optional().describe("true (default) = langsung terima & mulai kerja."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, deadline, note, start_now }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    const { data: me } = await supabase.auth.getUser();
    const userId = me?.user?.id;
    if (!userId) return errorResult("Tidak dapat membaca identitas pengguna.");

    const { error: assignError } = await supabase.rpc("assign_operator", {
      _order_id: order_id,
      _operator_id: userId,
      _deadline: deadline ?? null,
      _note: note ?? null,
    });
    if (assignError && !/ALREADY|DUPLICATE/i.test(assignError.message)) return errorResult(assignError.message);

    const steps: string[] = ["assigned"];
    if (start_now !== false) {
      for (const action of ["accept", "start"] as const) {
        const { error } = await supabase.rpc("operator_update_assignment", {
          _order_id: order_id,
          _action: action,
          _note: null,
          _percent: null,
          _is_public: true,
        });
        if (error) return errorResult(`${action}: ${error.message}`);
        steps.push(action);
      }
    }
    return jsonResult({ order_id, operator_id: userId, steps });
  },
});
