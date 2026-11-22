import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { renderErrorPage } from "@/lib/error-page";
import {
  generateRequestId,
  maskEmail,
  sanitizeSecurityMetadata,
  sanitizeUserAgent,
} from "@/lib/security-event.server";
import { handleCatalogRequest } from "@/lib/catalog-api.server";

describe("Security Event Utilities & Sanitization", () => {
  it("generates unique prefixed Request Reference IDs", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).toMatch(/^ebry-[a-z0-9]+-[a-z0-9]+$/);
    expect(b).toMatch(/^ebry-[a-z0-9]+-[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  it("masks actor email addresses without exposing full local-part", () => {
    expect(maskEmail("febry@ebrystore.my.id")).toBe("fe***@ebrystore.my.id");
    expect(maskEmail("a@x.id")).toBe("a***@x.id");
    expect(maskEmail(null)).toBeNull();
  });

  it("strips passwords, tokens, cookies, signatures, secrets, and JWTs from metadata", () => {
    const sanitized = sanitizeSecurityMetadata({
      password: "super-secret-password",
      refreshToken: "tok_12345",
      nested: {
        cookie: "sb-auth=xyz",
        api_key: "sk_live_abc",
        x_signature: "sig_999",
      },
      authText: "Bearer abcdef123456.payload.sig",
      rawJwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signaturevalue",
      payloadText: "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signaturevalue",
      attemptedRoute: "/admin/users",
    });

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.refreshToken).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).cookie).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).x_signature).toBe("[REDACTED]");
    expect(sanitized.authText).toBe("Bearer [REDACTED]");
    expect(sanitized.rawJwt).toBe("[REDACTED]");
    expect(sanitized.payloadText).toBe("token=[REDACTED_JWT]");
    expect(sanitized.attemptedRoute).toBe("/admin/users");
  });

  it("sanitizes control characters from User-Agent headers", () => {
    expect(sanitizeUserAgent("Mozilla/5.0\r\nX-Injected: bad\tAgent")).toBe(
      "Mozilla/5.0  X-Injected: bad Agent",
    );
  });
});

describe("Branded Security Error Pages & Zero Leakage", () => {
  it("renders 401, 403, 404, 429, and 500 error pages with escaped Request Reference ID", () => {
    for (const status of [401, 403, 404, 429, 500] as const) {
      const html = renderErrorPage({ status, requestId: `ebry-test-${status}` });
      expect(html).toContain(`${status} · Ebrystore Security`);
      expect(html).toContain(`ebry-test-${status}`);
      expect(html).not.toContain("permission");
      expect(html).not.toContain("SELECT ");
    }

    const xss = renderErrorPage({
      status: 403,
      requestId: '<script>alert("xss")</script>',
    });
    expect(xss).not.toContain("<script>alert");
    expect(xss).toContain("&lt;script&gt;alert");
  });

  it("does not expose raw permission keys in ForbiddenState or route denial screens", () => {
    const adminUiSrc = readFileSync("src/components/admin/admin-ui.tsx", "utf8");
    const forbiddenBlock = adminUiSrc
      .split("export function ForbiddenState")[1]
      .split("export function AdminLoading")[0];
    expect(forbiddenBlock).not.toContain("{permission}");
    expect(forbiddenBlock).not.toContain('permission ?');

    const adminRouteSrc = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
    expect(adminRouteSrc).not.toContain("<code>admin.dashboard.view</code>");
    expect(adminRouteSrc).toContain("SecurityErrorView");
    expect(adminRouteSrc).toContain("reportUnauthorizedRouteAccess");

    const seeRouteSrc = readFileSync("src/routes/see/_dashboard/route.tsx", "utf8");
    expect(seeRouteSrc).toContain("SecurityErrorView");
    expect(seeRouteSrc).toContain("reportUnauthorizedRouteAccess");
  });
});

describe("API Gateway, Catalog Rate Limit & Request Reference ID", () => {
  it("returns 429 JSON when catalog IP rate limit is exceeded", async () => {
    const res = await handleCatalogRequest(
      new Request("https://app.ebrystore.my.id/api/v1/catalog/products"),
      {
        categories: vi.fn(),
        products: vi.fn(),
        product: vi.fn(),
      } as any,
      async () => false,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  });

  it("attaches X-Request-Id and returns sanitized JSON error on /api/* server failure", async () => {
    vi.resetModules();
    vi.doMock("@tanstack/react-start/server-entry", () => ({
      default: {
        fetch: async () => {
          throw new Error("boom secret database detail");
        },
      },
    }));
    try {
      const { default: handler } = await import("@/server");
      const res = await handler.fetch(
        new Request("https://app.ebrystore.my.id/api/v1/catalog/products"),
        {},
        {},
      );
      expect(res.status).toBe(500);
      const reqId = res.headers.get("X-Request-Id");
      expect(reqId).toMatch(/^ebry-/);
      const body = await res.json();
      expect(body.error.requestId).toBe(reqId);
      expect(JSON.stringify(body)).not.toContain("boom secret database detail");
    } finally {
      vi.doUnmock("@tanstack/react-start/server-entry");
    }
  });
});

describe("Database Security Monitoring & Privilege Escalation Migration Contract", () => {
  const migrationSql = readFileSync(
    "supabase/migrations/20261122100000_security_monitoring_center.sql",
    "utf8",
  );

  it("blocks non-super_admin from escalating or revoking super_admin role in PostgreSQL trigger", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.protect_role_changes()");
    expect(migrationSql).toContain(
      "IF v_role = 'super_admin' AND auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid())",
    );
    expect(migrationSql).toContain(
      "DROP POLICY IF EXISTS permissions_write_admin ON public.permissions",
    );
    expect(migrationSql).toContain(
      "DROP POLICY IF EXISTS role_permissions_write_admin ON public.role_permissions",
    );
    expect(migrationSql).toContain("CREATE TRIGGER role_permissions_protect");
  });

  it("registers the 6 granular security.* permissions", () => {
    for (const key of [
      "security.events.read",
      "security.events.view_details",
      "security.alerts.read",
      "security.alerts.manage",
      "security.events.resolve",
      "security.settings.manage",
    ]) {
      expect(migrationSql).toContain(`'${key}'`);
    }
  });

  it("creates security_events, security_event_histories, and security_alerts with strict RLS & service_role writes", () => {
    for (const table of ["security_events", "security_event_histories", "security_alerts"]) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(migrationSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migrationSql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`,
      );
    }
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.record_security_event");
    expect(migrationSql).toContain("PRIVILEGE_ESCALATION_ATTEMPT");
    expect(migrationSql).toContain("WEBHOOK_SIGNATURE_TAMPERING");
    expect(migrationSql).toContain("BRUTE_FORCE_ADMIN_PROBE");
    expect(migrationSql).toContain("IDOR_ENUMERATION_BURST");
    expect(migrationSql).toContain("RATE_LIMIT_ABUSE_SPIKE");
  });
});

describe("Server Functions & Webhooks Access Governance Hardening", () => {
  it("enforces permission checks + rate limits across email-admin, growth, seo, inquiries, po, and MCP", () => {
    const emailAdmin = readFileSync("src/lib/email-admin.functions.ts", "utf8");
    expect(emailAdmin).toContain('assertPermission(ctx, permission, { endpoint:');
    expect(emailAdmin).toContain('canEmail(ctx, "settings.manage")');
    expect(emailAdmin).toContain('enforceRateLimit(ctx.userId, "email.test")');

    const growth = readFileSync("src/lib/growth.functions.ts", "utf8");
    expect(growth).toContain('canGrowth(ctx, "articles.view")');
    expect(growth).toContain('canGrowth(ctx, "admin.dashboard.view")');
    expect(growth).not.toContain('["admin", "super_admin", "support", "finance"].includes');

    const growthActions = readFileSync("src/lib/growth-actions.functions.ts", "utf8");
    expect(growthActions).toContain('hasPerm(ctx, "settings.seo.update")');
    expect(growthActions).toContain('hasPerm(ctx, "articles.update")');

    const campaigns = readFileSync("src/lib/campaigns.functions.ts", "utf8");
    expect(campaigns).toContain('assertPermission(ctx, "settings.seo.update"');

    const seoAudit = readFileSync("src/lib/seo-audit.functions.ts", "utf8");
    expect(seoAudit).toContain('canSeo(ctx, "settings.seo.update")');
    expect(seoAudit).toContain('enforceRateLimit(ctx.userId, "seo.audit")');

    const inquiries = readFileSync("src/lib/inquiries.functions.ts", "utf8");
    expect(inquiries).toContain('assertPermission(ctx, "orders.view"');
    expect(inquiries).toContain("INQUIRY_OWNERSHIP_VIOLATION");

    const po = readFileSync("src/lib/po.functions.ts", "utf8");
    expect(po).toContain('assertPermission(ctx, "orders.view"');

    const mcpRole = readFileSync("src/lib/mcp/tools/manage-user-role.ts", "utf8");
    expect(mcpRole).toContain("SELF_ROLE_ESCALATION_BLOCKED");
    expect(mcpRole).toContain("SUPER_ADMIN_ESCALATION_BLOCKED");
  });

  it("logs security_events on 401 failures across webhooks and internal job/ingest endpoints", () => {
    for (const file of [
      "src/routes/api/public/payments/webhook.shopeepay.ts",
      "src/routes/api/public/payments/webhook.sumopod.ts",
      "src/routes/api/public/jobs/email-dispatch.ts",
      "src/routes/api/public/jobs/shopeepay-reconcile.ts",
      "src/routes/api/public/jobs/telegram-dispatch.ts",
      "src/routes/api/public/integrations/jiofarm/demand.ts",
      "src/routes/api/public/integrations/jiofarm/links.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("recordSecurityEvent");
    }
  });
});
