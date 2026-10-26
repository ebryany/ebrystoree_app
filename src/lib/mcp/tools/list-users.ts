import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_users",
  title: "Daftar pengguna & role",
  description: "Menampilkan pengguna beserta email, nama, dan role yang dimiliki. Bisa dicari dan difilter per role.",
  inputSchema: {
    search: z.string().trim().max(120).optional().describe("Cari nama atau email."),
    role: z.enum(["all", "customer", "operator", "support", "finance", "admin", "super_admin"]).optional().describe("Filter role."),
    limit: z.number().int().min(1).max(100).optional().describe("Jumlah baris (default 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, role, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    // profiles and user_roles have no PostgREST-detectable relationship
    // (user_roles.user_id references auth.users), so join in memory.
    let query = supabase.from("profiles").select("id, full_name, email, phone, created_at");
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data: profiles, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return errorResult(error.message);

    const ids = (profiles ?? []).map((p) => p.id);
    let roleRows: { user_id: string; role: string }[] = [];
    if (ids.length) {
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (roleError) return errorResult(roleError.message);
      roleRows = roles ?? [];
    }

    const byUser = new Map<string, string[]>();
    for (const r of roleRows) {
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
    }

    let items = (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    if (role && role !== "all") {
      items = items.filter((row) => row.roles.includes(role));
    }
    return jsonResult({ items });
  },
});
