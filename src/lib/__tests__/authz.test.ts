import { beforeEach, describe, expect, it, vi } from "vitest";

const headerState = vi.hoisted(() => ({
  ip: "203.0.113.5",
  cookie: "",
  userAgent: "VitestBrowser/1.0",
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => {
    const lower = name.toLowerCase();
    if (lower === "cookie") return headerState.cookie;
    if (lower === "user-agent") return headerState.userAgent;
    return headerState.ip;
  },
}));

import { ADMIN_PORTAL_COOKIE_NAME, createAdminPortalCookieValue } from "../admin-portal.server";
import { ForbiddenError, assertPermission, loadAccess, slugify, writeAudit } from "../authz.server";

function setValidPortalCookie(userId: string, portal: "admin" | "see" = "admin") {
  const { value } = createAdminPortalCookieValue(userId, portal, headerState.userAgent);
  headerState.cookie = `${ADMIN_PORTAL_COOKIE_NAME}=${value}`;
}

beforeEach(() => {
  setValidPortalCookie("user-1", "admin");
});

function makeContext(roles: string[], permissions: string[]) {
  const rpcCalls: any[] = [];
  return {
    rpcCalls,
    ctx: {
      userId: "user-1",
      supabase: {
        from: () => ({ select: () => ({ eq: async () => ({ data: roles.map((role) => ({ role })) }) }) }),
        rpc: async (name: string, args?: any) => {
          rpcCalls.push({ name, args });
          if (name === "get_my_permissions") {
            return { data: permissions.map((permission_key) => ({ permission_key })) };
          }
          return { data: null };
        },
      },
    } as any,
  };
}

describe("slugify", () => {
  it("membuat slug aman dari nama produk", () => {
    expect(slugify("  Review  Struktur Makalah! ")).toBe("review-struktur-makalah");
  });
});

describe("loadAccess", () => {
  it("mengembalikan peran, izin, dan flag admin", async () => {
    const { ctx } = makeContext(["admin"], ["products.view"]);
    const access = await loadAccess(ctx);
    expect(access.roles).toEqual(["admin"]);
    expect(access.permissions).toEqual(["products.view"]);
    expect(access.isAdmin).toBe(true);
    expect(access.isSuperAdmin).toBe(false);
  });
});

describe("assertPermission", () => {
  it("mengizinkan ketika permission dimiliki", async () => {
    const { ctx } = makeContext(["admin"], ["products.create"]);
    await expect(assertPermission(ctx, "products.create")).resolves.toBeTruthy();
  });

  it("menolak admin tanpa permission spesifik", async () => {
    const { ctx } = makeContext(["admin"], ["products.view"]);
    await expect(assertPermission(ctx, "permissions.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menolak customer untuk dashboard admin", async () => {
    const { ctx } = makeContext(["customer"], []);
    await expect(assertPermission(ctx, "admin.dashboard.view")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("super admin memperoleh bypass dan bypass tercatat di audit log", async () => {
    const { ctx, rpcCalls } = makeContext(["super_admin"], []);
    await expect(assertPermission(ctx, "settings.manage")).resolves.toBeTruthy();
    const audit = rpcCalls.find((c) => c.name === "write_audit_log");
    expect(audit).toBeTruthy();
    expect(audit.args._action).toBe("permission.super_admin_bypass");
    expect(audit.args._after).toEqual({ permission: "settings.manage" });
  });

  it("menolak admin/super_admin bila cookie portal admin tidak ada (misal sesi dari /auth)", async () => {
    headerState.cookie = "";
    const { ctx } = makeContext(["super_admin"], ["admin.dashboard.view", "settings.manage"]);
    await expect(assertPermission(ctx, "settings.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menolak cookie portal /see saat mencoba mengakses server function admin, tetapi mengizinkan endpoint growth", async () => {
    setValidPortalCookie("user-1", "see");
    const { ctx } = makeContext(["admin"], ["settings.manage", "articles.view"]);
    await expect(assertPermission(ctx, "settings.manage")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assertPermission(ctx, "articles.view", { endpoint: "serverFn:growth:articles.view" }),
    ).resolves.toBeTruthy();
  });

  it("menolak cookie portal admin yang dimodifikasi atau milik user berbeda", async () => {
    setValidPortalCookie("other-user", "admin");
    const { ctx } = makeContext(["super_admin"], ["settings.manage"]);
    await expect(assertPermission(ctx, "settings.manage")).rejects.toBeInstanceOf(ForbiddenError);

    setValidPortalCookie("user-1", "admin");
    headerState.cookie = `${headerState.cookie}tampered`;
    await expect(assertPermission(ctx, "settings.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("writeAudit", () => {
  it("mengirim aksi, entitas, dan IP ke write_audit_log", async () => {
    const { ctx, rpcCalls } = makeContext(["admin"], ["products.update"]);
    await writeAudit(ctx, { action: "product.update", entityType: "digital_products", entityId: "p-1" });
    const audit = rpcCalls.find((c) => c.name === "write_audit_log");
    expect(audit.args._entity_type).toBe("digital_products");
    expect(audit.args._entity_id).toBe("p-1");
    expect(audit.args._ip).toBe("203.0.113.5");
  });

  it("tidak melempar error ketika audit gagal", async () => {
    const ctx = {
      userId: "u",
      supabase: {
        rpc: async () => {
          throw new Error("db down");
        },
      },
    } as any;
    await expect(writeAudit(ctx, { action: "x", entityType: "y" })).resolves.toBeUndefined();
  });
});
