import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const anonPriv = readFileSync(
  "supabase/migrations/20261003210000_anon_least_privilege.sql",
  "utf8",
);
const anonFn = readFileSync(
  "supabase/migrations/20261003220000_anon_function_least_privilege.sql",
  "utf8",
);
const overviewFn = readFileSync(
  "supabase/migrations/20261003230000_security_overview_functions.sql",
  "utf8",
);
const server = readFileSync("src/server.ts", "utf8");
const webhook = readFileSync("src/routes/api/public/payments/webhook.sumopod.ts", "utf8");
const securityFn = readFileSync("src/lib/security.functions.ts", "utf8");
const securityPage = readFileSync(
  "src/routes/_authenticated/admin/settings.security.tsx",
  "utf8",
);
const nav = readFileSync("src/lib/admin-nav.ts", "utf8");

describe("anon least privilege (static SQL contract)", () => {
  it("revokes every write privilege from anon on all tables", () => {
    expect(anonPriv).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
    expect(anonPriv).toContain("FROM anon");
    expect(anonPriv).toContain("c.relkind = 'r'");
  });

  it("keeps only an explicit public read whitelist for anon", () => {
    expect(anonPriv).toContain("v_public_read text[]");
    for (const table of [
      "articles",
      "categories",
      "digital_products",
      "product_reviews",
      "profiles",
      "service_addons",
      "service_packages",
      "services",
      "stores",
      "system_settings",
    ]) {
      expect(anonPriv).toContain(`'${table}'`);
    }
    expect(anonPriv).toContain("REVOKE SELECT ON public.%I FROM anon");
  });

  it("fixes search_path on the five definer functions", () => {
    for (const fn of [
      "get_my_inventory_summary",
      "get_my_low_stock_products",
      "search_products_fts",
      "seller_ingest_stock_codes",
      "verify_seller_product_ownership",
    ]) {
      expect(anonPriv).toContain(`ALTER FUNCTION public.${fn}`);
    }
    expect(anonPriv).toContain("SET search_path = public");
  });

  it("revokes function EXECUTE from PUBLIC because anon inherits it", () => {
    expect(anonFn).toContain("FROM PUBLIC, anon");
    expect(anonFn).toContain("v_public_exec text[]");
    expect(anonFn).toContain("'search_products_fts'");
    expect(anonFn).toContain("'store_rating_summary'");
  });
});

describe("security overview functions (static SQL contract)", () => {
  it("returns only counts and names, never row data", () => {
    expect(overviewFn).toContain("security_catalog_snapshot");
    expect(overviewFn).toContain("security_anon_functions");
    expect(overviewFn).toContain("security_definer_missing_search_path");
    expect(overviewFn).not.toMatch(/FROM public\.(orders|payments|profiles|stores)\b/);
  });

  it("keeps anon out and authenticated in", () => {
    const revokes = overviewFn.match(/FROM PUBLIC, anon, authenticated/g) ?? [];
    expect(revokes.length).toBe(3);
    const grants = overviewFn.match(/TO authenticated/g) ?? [];
    expect(grants.length).toBe(3);
  });
});

describe("perimeter headers (static contract)", () => {
  it("sets the full header set on HTML responses", () => {
    expect(server).toContain('headers.set("Content-Security-Policy", CSP)');
    expect(server).toContain('headers.set("X-Frame-Options", "SAMEORIGIN")');
    expect(server).toContain('headers.set("X-Content-Type-Options", "nosniff")');
    expect(server).toContain('headers.set("Referrer-Policy", "strict-origin-when-cross-origin")');
    expect(server).toContain('headers.set("Strict-Transport-Security"');
    expect(server).toContain('"Permissions-Policy"');
    expect(server).toContain("frame-ancestors 'self'");
    expect(server).toContain("object-src 'none'");
  });

  it("bounds the webhook body before reading it", () => {
    expect(webhook).toContain("content-length");
    expect(webhook).toContain("64 * 1024");
    expect(webhook).toContain('status: 413');
    expect(webhook.indexOf("payload too large")).toBeLessThan(
      webhook.indexOf("verifyWebhook"),
    );
  });
});

describe("admin security page (static contract)", () => {
  it("is guarded by permission and reads a server function", () => {
    expect(securityPage).toContain("useCan(\"settings.view\")");
    expect(securityPage).toContain("ForbiddenState");
    expect(securityPage).toContain("getSecurityOverview");
  });

  it("shows the real counts and findings without fabricating numbers", () => {
    expect(securityPage).toContain("overview.counts.tablesWithRls");
    expect(securityPage).toContain("overview.counts.anonWriteGrants");
    expect(securityPage).toContain("overview.counts.definerWithoutSearchPath");
    expect(securityPage).toContain("overview.findings.map");
    expect(securityPage).not.toMatch(/99\.9|10K\+/);
  });

  it("checks permission server-side too", () => {
    expect(securityFn).toContain('assertPermission(ctx, "settings.view")');
    expect(securityFn).toContain("requireSupabaseAuth");
  });

  it("is reachable from the admin navigation", () => {
    expect(nav).toContain('to: "/admin/settings/security"');
    expect(nav).toContain("ShieldCheck");
  });
});
