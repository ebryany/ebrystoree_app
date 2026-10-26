import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/toko.$slug.tsx", "utf8");
const sellerFns = readFileSync("src/lib/seller.functions.ts", "utf8");
const catalog = readFileSync("src/lib/marketplace-service-catalog.server.ts", "utf8");
const ratingMigration = readFileSync(
  "supabase/migrations/20261003180000_store_rating_public.sql",
  "utf8",
);

describe("store page shell and structure (static contract)", () => {
  it("wraps the storefront in the shared site shell", () => {
    expect(page).toContain("PageShell");
    expect(page).toContain("<PageShell>");
    expect(page).toContain("pendingComponent");
    expect(page).toContain("notFoundComponent");
  });

  it("shows store identity with an initial fallback and verification badge", () => {
    expect(page).toContain("const initial =");
    expect(page).toContain("is_platform");
    expect(page).toContain("Toko resmi");
  });

  it("shows verifiable trust signals with honest empty states", () => {
    expect(page).toContain("StarRating");
    expect(page).toContain("Belum ada ulasan");
    expect(page).toContain("Belum ada penjualan");
    expect(page).toContain("bergabung ${joined}");
  });

  it("never fabricates a rating when there are no reviews", () => {
    expect(page).toContain("rating.total > 0");
    expect(page).not.toMatch(/toFixed\(1\).*0\.0.*ulasan/);
  });

  it("offers contact only when the seller filled a phone number", () => {
    expect(page).toContain("whatsappHref");
    expect(page).toContain("wa.me/");
    expect(page).toContain("Hubungi penjual");
  });

  it("lists services before products and links to the service catalog", () => {
    const serviceIndex = page.indexOf('id="jasa-toko"');
    const productIndex = page.indexOf('id="produk-toko"');
    expect(serviceIndex).toBeGreaterThan(-1);
    expect(productIndex).toBeGreaterThan(-1);
    expect(serviceIndex).toBeLessThan(productIndex);
    expect(page).toContain("SellerServiceCard");
    expect(page).toContain('to="/layanan"');
  });

  it("provides in-store search and sorting for both listing types", () => {
    expect(page).toContain("Cari di toko ini");
    expect(page).toContain("SORT_LABEL");
    expect(page).toContain("price_asc");
    expect(page).toContain("popular");
    expect(page).toContain("aria-pressed={sort === key}");
  });

  it("never truncates a long product list silently", () => {
    expect(page).toContain("Tampilkan semua");
    expect(page).toContain("hasMoreProducts");
    expect(page).toContain("Menampilkan 48 produk terbaru");
  });

  it("adds metadata and structured trust without leaking private fields", () => {
    expect(page).toContain("og:image");
    expect(page).not.toContain("contact_email");
    expect(page).not.toContain("owner_id");
    expect(page).not.toContain("moderation_note");
  });

  it("keeps accessibility: labelled search, group sorting, status roles", () => {
    expect(page).toContain('aria-label="Cari di toko ini"');
    expect(page).toContain('role="group"');
    expect(page).toContain('role="status"');
    expect(page).toContain("min-h-11");
  });
});

describe("public store query contract (static source, not database execution)", () => {
  it("returns products, services, rating and sold count together", () => {
    expect(sellerFns).toContain("store_rating_summary");
    expect(sellerFns).toContain("readPublicStoreServices");
    expect(sellerFns).toContain("soldCount");
    expect(sellerFns).toContain("services:");
    expect(sellerFns).toContain("hasMoreProducts");
  });

  it("keeps the public projection free of private store and listing fields", () => {
    const storeSelect = sellerFns.slice(
      sellerFns.indexOf("const { data: store, error: storeError }"),
      sellerFns.indexOf("if (storeError)"),
    );
    expect(storeSelect).toContain("contact_phone");
    expect(storeSelect).not.toContain("contact_email");
    expect(storeSelect).not.toContain("verification_note");
    expect(storeSelect).not.toContain("suspended_reason");
  });

  it("keeps product and service eligibility identical to the catalog", () => {
    expect(sellerFns).toContain('.eq("moderation_status", "approved")');
    expect(sellerFns).toContain('.eq("status", "published")');
    expect(sellerFns).toContain('.is("deleted_at", null)');
    expect(catalog).toContain('.eq("status", "approved")');
    expect(catalog).toContain('.eq("store.status", "active")');
    expect(catalog).toContain('.eq("category.kind", "service")');
    expect(catalog).toContain('.is("category.deleted_at", null)');
  });

  it("scopes store services to the store and never opens private tables", () => {
    const storeServices = catalog.slice(catalog.indexOf("readPublicStoreServices"));
    expect(storeServices).toContain('.eq("store_id", storeId)');
    expect(storeServices).toContain("supabaseAdmin");
    expect(storeServices).not.toContain('select("*")');
  });
});

describe("store rating public migration (static contract)", () => {
  it("grants the aggregate to anon without opening review rows", () => {
    expect(ratingMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO anon, authenticated",
    );
    expect(ratingMigration).toContain(
      "REVOKE ALL ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC",
    );
    expect(ratingMigration).toContain("is_visible = true");
    expect(ratingMigration).not.toMatch(/GRANT (SELECT|ALL) ON public\.product_reviews TO anon/);
  });

  it("keeps the aggregate SECURITY DEFINER and identity-free", () => {
    expect(ratingMigration).toContain("SECURITY DEFINER");
    expect(ratingMigration).toContain("'average'");
    expect(ratingMigration).toContain("'total'");
    expect(ratingMigration).not.toMatch(/user_id|email|title|body/);
  });
});
