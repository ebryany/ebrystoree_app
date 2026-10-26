import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_audit_logs",
  title: "Daftar audit log",
  description: "Menampilkan jejak audit tindakan penting (siapa, apa, kapan) untuk penelusuran.",
  inputSchema: {
    action: z.string().trim().max(80).optional().describe("Filter nama aksi."),
    entity_type: z.string().trim().max(80).optional().describe("Filter jenis entitas, mis. order, payment."),
    limit: z.number().int().min(1).max(100).optional().describe("Jumlah baris (default 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ action, entity_type, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("audit_logs")
      .select("id, actor_id, actor_role, action, entity_type, entity_id, reason, created_at");
    if (action) query = query.eq("action", action);
    if (entity_type) query = query.eq("entity_type", entity_type);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 30);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
