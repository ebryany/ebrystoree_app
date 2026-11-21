import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { analyticsEventSchema, readBoundedJson } from "@/routes/api/public/analytics/track";

describe("analytics/track security hardening", () => {
  it("accepts valid public storefront analytics events", () => {
    for (const event of [
      "page_view",
      "product_view",
      "service_view",
      "article_view",
      "checkout_start",
    ]) {
      const parsed = analyticsEventSchema.safeParse({ event, path: "/produk/contoh" });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects browser-submitted payment_success events", () => {
    const parsed = analyticsEventSchema.safeParse({
      event: "payment_success",
      path: "/pembayaran/123",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects payloads exceeding 4 KB even when Content-Length header is absent", async () => {
    const oversized = JSON.stringify({
      event: "page_view",
      path: "/",
      extra: "a".repeat(4500),
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(oversized);
        controller.enqueue(bytes.subarray(0, 2048));
        controller.enqueue(bytes.subarray(2048));
        controller.close();
      },
    });
    const req = new Request("https://app.ebrystore.my.id/api/public/analytics/track", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(req.headers.get("content-length")).toBeNull();
    expect(await readBoundedJson(req, 4096)).toBeNull();
  });

  it("returns null on invalid JSON without throwing", async () => {
    const req = new Request("https://app.ebrystore.my.id/api/public/analytics/track", {
      method: "POST",
      body: "{bad json",
    });
    expect(await readBoundedJson(req, 4096)).toBeNull();
  });
});

describe("reviews & rating integrity hardening", () => {
  const reviewsSrc = readFileSync("src/lib/reviews.functions.ts", "utf8");
  const catalogSrc = readFileSync("src/lib/catalog.functions.ts", "utf8");
  const storeCardSrc = readFileSync("src/lib/store-card.server.ts", "utf8");
  const serviceCatalogSrc = readFileSync("src/lib/marketplace-service-catalog.server.ts", "utf8");
  const ratingMigration = readFileSync(
    "supabase/migrations/20261121132000_verified_reviews_rating_only.sql",
    "utf8",
  );

  it("forces guest product and service reviews into moderation (is_visible: false, is_verified: false)", () => {
    const guestProduct = reviewsSrc
      .split("export const submitGuestReview")[1]
      .split("export const listServiceReviews")[0];
    expect(guestProduct).toContain('.select("id, store_id")');
    expect(guestProduct).toContain("is_verified: false");
    expect(guestProduct).toContain("is_visible: false");

    const guestService = reviewsSrc
      .split("export const submitGuestServiceReview")[1]
      .split("export const submitProductReview")[0];
    expect(guestService).toContain("is_verified: false");
    expect(guestService).toContain("is_visible: false");
  });

  it("aggregates ratings using verified reviews only across server functions and SQL", () => {
    expect(reviewsSrc).toContain('.eq("is_verified", true)');
    expect(reviewsSrc).toContain("items.filter((r) => Boolean(r.is_verified))");
    expect(catalogSrc).toContain('.eq("is_verified", true)');
    expect(storeCardSrc).toContain('.eq("is_verified", true)');
    expect(serviceCatalogSrc).toContain('.eq("is_verified", true)');
    expect(ratingMigration).toContain("AND is_verified = true");
  });
});

describe("MCP tool authorization contract", () => {
  it("guards every MCP tool call with authGuard and user-scoped RLS client", () => {
    const mcpHelper = readFileSync("src/lib/mcp/supabase.ts", "utf8");
    expect(mcpHelper).toContain("ctx.isAuthenticated()");
    expect(mcpHelper).toContain("Authorization: `Bearer ${token}`");
    const roleTool = readFileSync("src/lib/mcp/tools/manage-user-role.ts", "utf8");
    expect(roleTool).toContain("authGuard(ctx)");
    expect(roleTool).toContain("supabaseForUser(ctx)");
    expect(roleTool).not.toContain("supabaseAdmin");
  });

  it("documents HTML lang='id' and single google-site-verification in root", () => {
    const rootSrc = readFileSync("src/routes/__root.tsx", "utf8");
    expect(rootSrc).toContain('const lang = s.site_language === "en" ? "en" : "id"');
    expect(rootSrc).toContain("<html lang={lang}>");
    expect(rootSrc).toContain('s.seo_google_verification || "5V5oY0ERtp1nkZTxzinF-GwbMZwJAj3fSTiYPUwaCIg"');
    expect(rootSrc.match(/name:\s*"google-site-verification"/g)?.length).toBe(1);
    void vi;
  });
});
