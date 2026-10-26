/**
 * Lapisan otorisasi server-side Slice 1.
 * Semua mutasi/query sensitif WAJIB melewati assertPermission().
 * assertAdmin() dipertahankan sementara untuk kompatibilitas migrasi.
 */
import { getRequestHeader } from "@tanstack/react-start/server";

export type AuthzContext = { supabase: any; userId: string };

export class ForbiddenError extends Error {
  permission: string;
  constructor(permission: string) {
    super("FORBIDDEN");
    this.permission = permission;
  }
}

export type Access = {
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
};

export async function loadAccess(context: AuthzContext): Promise<Access> {
  const [{ data: roleRows }, { data: permRows }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.rpc("get_my_permissions"),
  ]);

  const roles = (roleRows ?? []).map((r: { role: string }) => r.role as string);
  const permissions = (permRows ?? []).map((p: { permission_key: string }) => p.permission_key);

  return {
    roles,
    permissions,
    isSuperAdmin: roles.includes("super_admin"),
    isAdmin: roles.some((r: string) => r === "admin" || r === "super_admin"),
  };
}

function clientIp(): string | null {
  try {
    const fwd = getRequestHeader("x-forwarded-for");
    return fwd ? fwd.split(",")[0]!.trim() : null;
  } catch {
    return null;
  }
}

/** Catat aktivitas ke audit_logs melalui SECURITY DEFINER function. */
export async function writeAudit(
  context: AuthzContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
) {
  try {
    await context.supabase.rpc("write_audit_log", {
      _action: entry.action,
      _entity_type: entry.entityType,
      _entity_id: entry.entityId ?? null,
      _before: entry.before ?? null,
      _after: entry.after ?? null,
      _reason: entry.reason ?? null,
      _ip: clientIp(),
      _trace_id: null,
    });
  } catch {
    console.error("[audit] gagal menulis audit log untuk", entry.action);
  }
}

/**
 * Memastikan pemanggil punya permission tertentu.
 * super_admin memperoleh bypass terkontrol dan bypass tersebut dicatat di audit log.
 */
export async function assertPermission(context: AuthzContext, permission: string): Promise<Access> {
  const access = await loadAccess(context);
  if (access.permissions.includes(permission)) return access;

  if (access.isSuperAdmin) {
    await writeAudit(context, {
      action: "permission.super_admin_bypass",
      entityType: "permission",
      after: { permission },
      reason: "Super admin bypass",
    });
    return access;
  }

  throw new ForbiddenError(permission);
}

/** @deprecated Kompatibilitas sementara — gunakan assertPermission(). */
export async function assertAdmin(context: AuthzContext): Promise<Access> {
  return assertPermission(context, "admin.dashboard.view");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
