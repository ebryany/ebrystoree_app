import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_service_jobs",
  title: "Daftar pengerjaan jasa",
  description:
    "Menampilkan pesanan jasa beserta operator yang ditugaskan, status penugasan, progres terakhir, dan hasil yang dikirim.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filter status pesanan jasa."),
    unassigned_only: z.boolean().optional().describe("true = hanya pesanan yang belum punya operator."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, unassigned_only, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, total, created_at, paid_at, operator_assignments(id, operator_id, status, deadline_at, assigned_at), job_results(id, version, status, summary, submitted_at), job_progress(percent, note, created_at)",
      )
      .eq("order_type", "service");
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    let items = data ?? [];
    if (unassigned_only) {
      items = items.filter((row) => !((row as { operator_assignments?: unknown[] }).operator_assignments?.length));
    }
    return jsonResult({ items });
  },
});
