import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "hermes_update_progress",
  title: "Kabari progres pengerjaan",
  description:
    "Mengirim update progres pengerjaan jasa (persentase dan catatan) yang langsung tampil di timeline pesanan pembeli.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan jasa."),
    percent: z.number().int().min(0).max(100).describe("Persentase progres 0-100."),
    note: z.string().trim().max(1000).optional().describe("Catatan progres untuk pembeli."),
    internal_only: z.boolean().optional().describe("true = catatan hanya untuk internal, tidak tampil ke pembeli."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, percent, note, internal_only }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("operator_update_assignment", {
      _order_id: order_id,
      _action: "progress",
      _note: note ?? null,
      _percent: percent,
      _is_public: internal_only !== true,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
