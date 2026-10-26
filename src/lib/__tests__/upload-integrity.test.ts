import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const limits = readFileSync("supabase/migrations/20261003240000_storage_bucket_limits.sql", "utf8");
const academic = readFileSync("src/lib/academic.functions.ts", "utf8");
const sellerFiles = readFileSync("src/lib/seller-files.functions.ts", "utf8");
const productFiles = readFileSync("src/lib/product-files.functions.ts", "utf8");
const orders = readFileSync("src/lib/orders.functions.ts", "utf8");
const articles = readFileSync("src/lib/website-settings.ts", "utf8");

describe("storage bucket limits (static SQL contract)", () => {
  it("bounds the three previously unbounded buckets", () => {
    expect(limits).toContain("'product-files', 104857600::bigint");
    expect(limits).toContain("'job-results', 41943040::bigint");
    expect(limits).toContain("'academic-order-attachments', 20971520::bigint");
  });

  it("never allows SVG or HTML in any bucket", () => {
    expect(limits).toContain("image/svg+xml");
    expect(limits).toContain("text/html");
    expect(limits).toContain("UNSAFE_MIME_ALLOWED");
    // SVG/HTML hanya muncul sebagai penolakan, bukan sebagai bagian daftar izin.
    const allowedLists = limits.slice(limits.indexOf("ARRAY["), limits.indexOf(") AS m(id"));
    expect(allowedLists).not.toContain("'image/svg+xml'");
    expect(allowedLists).not.toContain("'text/html'");
  });

  it("fills only empty configuration and rejects a missing limit", () => {
    expect(limits).toContain("COALESCE(b.file_size_limit, manifest.file_size_limit)");
    expect(limits).toContain("COALESCE(b.allowed_mime_types, manifest.allowed_mime_types)");
    expect(limits).toContain("BUCKET_LIMIT_MISSING");
    expect(limits).toContain("BUCKET_MANIFEST_UNSAFE");
  });
});

describe("upload metadata integrity (static source contract)", () => {
  it("reads size and mime from the stored object, not the client claim", () => {
    for (const source of [academic, sellerFiles, productFiles]) {
      expect(source).toContain("metadata");
      expect(source).toContain("actualSize");
      expect(source).toContain("actualMime");
      expect(source).toMatch(/data\.sizeBytes !== actualSize|data\.fileSize !== actualSize/);
    }
  });

  it("rejects registration when the object is missing", () => {
    for (const source of [academic, sellerFiles, productFiles]) {
      expect(source).toMatch(/belum terunggah sepenuhnya|Berkas belum terunggah/);
    }
  });

  it("stores the verified metadata instead of the client values", () => {
    expect(academic).toContain("file_size: actualSize");
    expect(sellerFiles).toContain("size_bytes: actualSize");
    expect(productFiles).toContain("size_bytes: actualSize");
  });

  it("still scopes every path to the owner", () => {
    expect(academic).toContain("data.storagePath.startsWith(`${ctx.userId}/`)");
    expect(sellerFiles).toContain("data.path.startsWith(`${data.productId}/`)");
    expect(productFiles).toContain("data.path.startsWith(`${data.productId}/`)");
  });
});

describe("request manipulation boundaries (static contract)", () => {
  it("never accepts price or total from the client for order creation", () => {
    const createDigital = orders.slice(
      orders.indexOf("export const createDigitalOrder"),
      orders.indexOf("export const createServiceOrder"),
    );
    expect(createDigital).toContain("productId: z.string().uuid()");
    expect(createDigital).toContain("quantity: z.number().int().min(1).max(10)");
    expect(createDigital).not.toMatch(/price:\s*z\./);
    expect(createDigital).not.toMatch(/total:\s*z\./);
  });

  it("keeps URL sanitisation for rendered links", () => {
    expect(articles).toContain("export function isSafeUrl");
    expect(articles).toMatch(/javascript\|data\|vbscript\|file/);
    expect(articles).toContain("isBannerAssetUrl");
  });

  it("does not use dangerouslySetInnerHTML with user data", () => {
    const chart = readFileSync("src/components/ui/chart.tsx", "utf8");
    expect(chart).toContain("dangerouslySetInnerHTML");
    // Satu-satunya pemakaian adalah CSS variabel tema, bukan konten pengguna.
    expect(chart).not.toContain("user");
    expect(chart).not.toContain("content}");
  });
});
