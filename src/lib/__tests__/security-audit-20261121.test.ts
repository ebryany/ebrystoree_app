import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, type: "image/svg+xml" },
          error: null,
        }),
      }),
    },
  },
}));

describe("Security Audit 2026-11-21 — Media Proxy XSS & URIError", () => {
  it("rejects malformed URI sequences (%) with 404 instead of throwing 500 across media endpoints", async () => {
    const { Route: CatalogImgRoute } = await import("@/routes/api/public/catalog-image.$.tsx");
    const { Route: ServiceMediaRoute } = await import("@/routes/api/public/service-media.$.tsx");
    const { Route: OgImgRoute } = await import("@/routes/api/public/og-image.$.tsx");

    const catalogGet = (CatalogImgRoute as any).options.server.handlers.GET;
    const serviceGet = (ServiceMediaRoute as any).options.server.handlers.GET;
    const ogGet = (OgImgRoute as any).options.server.handlers.GET;

    for (const fn of [catalogGet, serviceGet, ogGet]) {
      const res = await fn({ params: { _splat: "%E0%A4%A" } });
      expect(res.status).toBe(404);
    }
  });

  it("blocks SVG/HTML extensions on catalog-image and enforces safe MIME + CSP sandbox", async () => {
    const { Route: CatalogImgRoute } = await import("@/routes/api/public/catalog-image.$.tsx");
    const catalogGet = (CatalogImgRoute as any).options.server.handlers.GET;

    const blockedSvg = await catalogGet({ params: { _splat: "products/evil.svg" } });
    expect(blockedSvg.status).toBe(404);

    const blockedHtml = await catalogGet({ params: { _splat: "products/evil.html" } });
    expect(blockedHtml.status).toBe(404);

    const validPng = await catalogGet({ params: { _splat: "products/item-1.png" } });
    expect(validPng.status).toBe(200);
    expect(validPng.headers.get("content-type")).toBe("image/png");
    expect(validPng.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(validPng.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("enforces extension-mapped Content-Type and CSP sandbox on service-media", async () => {
    const { Route: ServiceMediaRoute } = await import("@/routes/api/public/service-media.$.tsx");
    const serviceGet = (ServiceMediaRoute as any).options.server.handlers.GET;

    const res = await serviceGet({ params: { _splat: "store-1/sample.webp" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });
});

describe("Security Audit 2026-11-21 — Seller Moderation Reset, CSV Injection, JioFarm, OAuth & Payments", () => {
  it("seller-files resets product moderation explicitly when updating version via service role", () => {
    const src = readFileSync("src/lib/seller-files.functions.ts", "utf8");
    expect(src).toContain("resetProductModerationForVersion");
    expect(src).toContain('moderation_status: "pending"');
    expect(src).toContain('currentProd?.status === "published" ? { status: "draft" } : {}');
  });

  it("export-orders-csv neutralizes spreadsheet formula prefixes", () => {
    const src = readFileSync("src/lib/mcp/tools/export-orders-csv.ts", "utf8");
    expect(src).toContain("/^[=+\\-@\\t\\r]/");
    expect(src).toContain("text = `'${text}`");
  });

  it("jiofarm/links enforces request size bound and ignores soft-deleted products", () => {
    const routeSrc = readFileSync("src/routes/api/public/integrations/jiofarm/links.ts", "utf8");
    const libSrc = readFileSync("src/lib/stock-codes.server.ts", "utf8");
    expect(routeSrc).toContain("MAX_INGEST_BYTES");
    expect(routeSrc).toContain("413");
    expect(libSrc).toContain('.is("deleted_at", null)');
  });

  it("oauth consent validates http/https redirect scheme and checkQrisPayment filters user_id", () => {
    const consentSrc = readFileSync("src/routes/[.]lovable.oauth.consent.tsx", "utf8");
    expect(consentSrc).toContain("safeOauthRedirectUrl");
    expect(consentSrc).toContain('u.protocol === "https:" || u.protocol === "http:"');

    const paySrc = readFileSync("src/lib/payments.functions.ts", "utf8");
    const checkBlock = paySrc
      .split("export const checkQrisPayment")[1]
      .split("export const startShopeepayPayment")[0];
    expect(checkBlock).toContain('.eq("user_id", (context as Ctx).userId)');
  });
});
