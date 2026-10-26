import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { readPublicMarketplaceServices } from "../marketplace-service-catalog.server";
import { MARKETPLACE_SERVICE_CHECKOUT_ENABLED } from "../marketplace-service";
import { FIELD_BY_KEY, homeBannerSlides, validateField } from "../website-settings";

const imageUrl = "/api/public/catalog-image/branding/home/0f8f86a1-2b3c-4d5e-6f70-8a9b0c1d2e3f.jpg";
const agreement = {
  scope: "Lingkup pekerjaan desain",
  exclusions: "Cetak",
  deliverable: "File desain",
  requirements: "Brief pembeli",
  durationDays: 3,
  revisionLimit: 2,
};

function client(result: { data: unknown[] | null; count: number | null; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const from = vi.fn(() => query);
  return { query, from, sb: { from } as unknown as SupabaseClient };
}

describe("public seller service catalog", () => {
  it("applies all eligibility guards before pagination and strips private fields", async () => {
    const mock = client({
      data: [
        {
          id: "0f8f86a1-2b3c-4d5e-8f70-8a9b0c1d2e3f",
          name: "Jasa desain",
          price: "150000",
          agreement,
          store: { name: "Toko", slug: "toko", owner_id: "private" },
          category: { name: "Desain", slug: "desain" },
          moderation_note: "private",
          reviewed_by: "private",
        },
      ],
      count: 14,
      error: null,
    });
    const result = await readPublicMarketplaceServices(
      { page: 1, pageSize: 6, q: "desain_%", category: "desain" },
      mock.sb,
    );
    expect(mock.from).toHaveBeenCalledWith("marketplace_services");
    expect(mock.query.eq.mock.calls).toEqual([
      ["status", "approved"],
      ["store.status", "active"],
      ["category.kind", "service"],
      ["category.is_active", true],
      ["category.slug", "desain"],
    ]);
    expect(mock.query.is).toHaveBeenCalledWith("category.deleted_at", null);
    expect(mock.query.select.mock.calls[0][0]).toContain("stores!inner");
    expect(mock.query.select.mock.calls[0][0]).toContain("categories!inner");
    expect(mock.query.select.mock.calls[0][0]).not.toMatch(
      /owner_id|moderation_note|reviewed_by|\*/,
    );
    expect(mock.query.range).toHaveBeenCalledWith(6, 11);
    expect(mock.query.ilike).toHaveBeenCalledWith("name", "%desain%");
    expect(result).toMatchObject({ total: 14, page: 1, nextPage: 2, error: null });
    expect(result.items[0].price).toBe(150000);
    expect(JSON.stringify(result.items)).not.toContain("private");
    expect(MARKETPLACE_SERVICE_CHECKOUT_ENABLED).toBe(true);
  });

  it("ends pagination at the exact count and keeps empty distinct from query failure", async () => {
    const empty = await readPublicMarketplaceServices(
      {},
      client({ data: [], count: 0, error: null }).sb,
    );
    expect(empty).toMatchObject({ items: [], total: 0, nextPage: null, error: null });
    const last = await readPublicMarketplaceServices(
      { page: 1, pageSize: 6 },
      client({ data: [], count: 12, error: null }).sb,
    );
    expect(last.nextPage).toBeNull();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await readPublicMarketplaceServices(
      {},
      client({ data: null, count: null, error: new Error("DB offline") }).sb,
    );
    expect(failed.error).toContain("tidak dapat dimuat");
    log.mockRestore();
  });
});

describe("admin banner collection", () => {
  const field = FIELD_BY_KEY.get("home_banner_slides")!;
  it("validates uploaded assets, alt, limits and legacy compatibility", () => {
    const slide = { imageUrl, mobileUrl: "", alt: " Pesan admin " };
    expect(validateField(field, [slide])).toEqual({
      ok: true,
      value: [{ ...slide, alt: "Pesan admin" }],
    });
    for (const value of [
      null,
      {},
      Array(6).fill(slide),
      [{ ...slide, imageUrl: "https://evil.test/a.jpg" }],
      [{ ...slide, mobileUrl: "javascript:alert(1)" }],
      [{ ...slide, alt: "" }],
      [{ ...slide, alt: "a".repeat(201) }],
    ]) {
      expect(validateField(field, value).ok).toBe(false);
    }
    expect(
      homeBannerSlides({
        home_banner_image_url: imageUrl,
        home_banner_alt: "Utama",
        home_banner_slides: [slide],
      }),
    ).toHaveLength(2);
    expect(
      homeBannerSlides({ home_banner_image_url: "", home_banner_mobile_image_url: imageUrl }),
    ).toEqual([]);
    expect(homeBannerSlides({ home_banner_image_url: imageUrl })).toEqual([
      { imageUrl, mobileUrl: "", alt: "Banner Ebrystore" },
    ]);
  });
});
