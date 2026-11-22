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
    const actorId = ctx.getUserId();
    const supabase = supabaseForUser(ctx);

    if (user_id === actorId && action === "grant") {
      try {
        const { recordSecurityEvent } = await import("../../security-event.server");
        await recordSecurityEvent({
          eventType: "privilege_escalation_attempt",
          severity: "CRITICAL",
          category: "security_violation",
          actorUserId: actorId,
          endpoint: "mcp:manage_user_role",
          actionName: "manage_user_role",
          targetResourceType: "user_roles",
          targetResourceId: user_id,
          statusCode: 403,
          reasonCode: "SELF_ROLE_ESCALATION_BLOCKED",
          sourceSystem: "mcp",
          metadata: { role, action },
        });
      } catch {
        /* pencatatan fail-safe */
      }
      return errorResult("Tidak dapat memberikan peran untuk akun sendiri.");
    }

    if (role === "super_admin") {
      const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: actorId });
      if (!isSuper) {
        try {
          const { recordSecurityEvent } = await import("../../security-event.server");
          await recordSecurityEvent({
            eventType: "privilege_escalation_attempt",
            severity: "CRITICAL",
            category: "security_violation",
            actorUserId: actorId,
            endpoint: "mcp:manage_user_role",
            actionName: "manage_user_role",
            targetResourceType: "user_roles",
            targetResourceId: user_id,
            statusCode: 403,
            reasonCode: "SUPER_ADMIN_ESCALATION_BLOCKED",
            sourceSystem: "mcp",
            metadata: { role, action },
          });
        } catch {
          /* pencatatan fail-safe */
        }
        return errorResult("Hanya super admin yang dapat mengubah peran super_admin.");
      }
    }

    if (action === "grant") {
      const { data, error } = await supabase
        .from("user_roles")
        .upsert({ user_id, role, granted_by: actorId }, { onConflict: "user_id,role" })
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
