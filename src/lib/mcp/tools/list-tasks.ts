import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_admin_tasks",
  title: "Daftar tugas admin",
  description: "Menampilkan antrean tugas operasional (verifikasi pembayaran, refund, SLA) beserta prioritas dan tenggat.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filter status tugas, mis. open, in_progress, done."),
    task_type: z.string().trim().max(60).optional().describe("Filter jenis tugas."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, task_type, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("admin_tasks")
      .select("id, task_number, task_type, title, description, priority, status, assignee_id, due_at, created_at");
    if (status) query = query.eq("status", status);
    if (task_type) query = query.eq("task_type", task_type);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
