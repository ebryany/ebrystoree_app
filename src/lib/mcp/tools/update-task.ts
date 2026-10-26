import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_admin_task",
  title: "Kelola tugas admin",
  description: "Mengambil, menugaskan, menyelesaikan, membatalkan, atau membuka kembali sebuah tugas operasional.",
  inputSchema: {
    task_id: z.string().uuid().describe("ID tugas."),
    action: z.enum(["claim", "assign", "complete", "cancel", "reopen"]).describe("Tindakan pada tugas."),
    assignee_id: z.string().uuid().optional().describe("ID petugas tujuan (untuk action assign)."),
    note: z.string().trim().max(1000).optional().describe("Catatan tugas."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ task_id, action, assignee_id, note }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (action === "assign" && !assignee_id) return errorResult("assignee_id wajib diisi untuk action assign.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("update_admin_task", {
      _task_id: task_id,
      _action: action,
      _assignee: assignee_id ?? null,
      _note: note ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
