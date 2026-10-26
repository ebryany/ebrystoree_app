import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "manage_user_role",
  title: "Beri / cabut role pengguna",
  description:
    "Memberikan atau mencabut role (customer, operator, support, finance, admin, super_admin) untuk seorang pengguna. Hanya berhasil bila akun punya izin kelola pengguna.",
  inputSchema: {
    user_id: z.string().uuid().describe("ID pengguna (lihat list_users)."),
    role: z.enum(["customer", "operator", "support", "finance", "admin", "super_admin"]).describe("Role yang diatur."),
    action: z.enum(["grant", "revoke"]).describe("grant = beri role, revoke = cabut role."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ user_id, role, action }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    if (action === "grant") {
      const { data, error } = await supabase
        .from("user_roles")
        .upsert({ user_id, role, granted_by: ctx.getUserId() }, { onConflict: "user_id,role" })
        .select("user_id, role")
        .maybeSingle();
      if (error) return errorResult(error.message);
      return jsonResult({ granted: data });
    }
    const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
    if (error) return errorResult(error.message);
    return jsonResult({ revoked: { user_id, role } });
  },
});
