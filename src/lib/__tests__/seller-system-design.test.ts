import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { slugifyStoreName } from "@/components/seller/seller-ui";

const SELLER_FILES = [
  "src/components/seller/seller-ui.tsx",
  "src/components/seller/seller-sidebar.tsx",
  "src/components/seller/seller-onboarding.tsx",
  "src/components/seller/marketplace-service-catalog.tsx",
  "src/routes/_authenticated/seller.tsx",
  "src/routes/_authenticated/seller.index.tsx",
  "src/routes/_authenticated/seller.pesanan.tsx",
  "src/routes/_authenticated/seller.jasa-pesanan.tsx",
  "src/routes/_authenticated/seller.produk.index.tsx",
  "src/routes/_authenticated/seller.produk.baru.tsx",
  "src/routes/_authenticated/seller.produk.$id.tsx",
  "src/routes/_authenticated/seller.keuangan.tsx",
  "src/routes/_authenticated/seller.performa.tsx",
  "src/routes/_authenticated/seller.pengaturan.tsx",
];

describe("Seller System Design & Ajukan Seller Redesign", () => {
  it("slugifies store names deterministically for /toko/<slug>", () => {
    expect(slugifyStoreName("Studio Template Nusantara")).toBe("studio-template-nusantara");
    expect(slugifyStoreName("  Café & Desain 24/7!!  ")).toBe("cafe-desain-24-7");
    expect(slugifyStoreName("A".repeat(80)).length).toBe(60);
    expect(slugifyStoreName("---")).toBe("");
  });

  it("removes em dashes from all redesigned seller & onboarding source files", () => {
    for (const file of SELLER_FILES) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not contain em dash`).not.toContain("\u2014");
    }
  });

  it("applies modern web guidance CSS rules: @container, forced-colors tab border, and :user-invalid", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("container-name: seller-main");
    expect(css).toContain("@container seller-main");
    expect(css).toContain('.seller-tab[aria-selected="true"]::after');
    expect(css).toContain("border-block-end:");
    expect(css).toContain(".seller-field-control:is(:user-invalid");
  });

  it("wires Ajukan Seller onboarding with contactEmail, live preview, and post-interaction ARIA validation", () => {
    const onboarding = readFileSync("src/components/seller/seller-onboarding.tsx", "utf8");
    const layout = readFileSync("src/routes/_authenticated/seller.tsx", "utf8");
    expect(layout).toContain("<SellerOnboarding />");
    expect(layout).toContain("<StoreStatusBanner store={store} />");
    expect(layout).toContain("min-h-dvh");
    expect(layout).toContain("ErrorState");
    expect(onboarding).toContain("contactEmail");
    expect(onboarding).toContain("Pratinjau etalase toko");
    expect(onboarding).toContain('aria-live="polite"');
    expect(onboarding).toContain("nameRef.current?.focus()");
  });

  it("eliminates decorative blur orbs on finance, uses semantic nav for mobile tabs, and uses AlertDialog for product archive", () => {
    const finance = readFileSync("src/routes/_authenticated/seller.keuangan.tsx", "utf8");
    const sidebar = readFileSync("src/components/seller/seller-sidebar.tsx", "utf8");
    const settings = readFileSync("src/routes/_authenticated/seller.pengaturan.tsx", "utf8");
    const editProduct = readFileSync("src/routes/_authenticated/seller.produk.$id.tsx", "utf8");

    expect(finance).not.toContain("blur-3xl");
    expect(finance).toContain("SellerFilterTabs");
    expect(sidebar).toContain("<nav");
    expect(sidebar).not.toContain('role="tablist"');
    expect(settings).toContain("SellerPageHeader");
    expect(settings).toContain("Pratinjau header etalase");
    expect(editProduct).toContain("<AlertDialog");
    expect(editProduct).not.toContain("confirm(");
  });

  it("delivers unified mobile Seller UX: single Navbar hamburger drawer with Seller menu, sibling switchers, safe-area scroll padding, clipped avatar, and horizontal mobile product cards", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const header = readFileSync("src/components/site-header.tsx", "utf8");
    const sidebar = readFileSync("src/components/seller/seller-sidebar.tsx", "utf8");
    const layout = readFileSync("src/routes/_authenticated/seller.tsx", "utf8");
    const products = readFileSync("src/routes/_authenticated/seller.produk.index.tsx", "utf8");
    const orders = readFileSync("src/routes/_authenticated/seller.pesanan.tsx", "utf8");
    const onboarding = readFileSync("src/components/seller/seller-onboarding.tsx", "utf8");

    expect(header).toContain("mobileDrawer");
    expect(sidebar).toContain("SellerNavbarDrawerContent");
    expect(sidebar).toContain("SELLER_NAV_GROUPS");
    expect(css).toContain("scroll-padding-bottom:");
    expect(layout).toContain("SellerNavbarDrawerContent");
    expect(layout).not.toContain("SellerMobileDrawer");
    expect(layout).toContain("isMobileChatThread");
    expect(layout).toContain("env(safe-area-inset-bottom)");
    expect(layout).toContain("block h-full w-full overflow-hidden");
    expect(layout).toContain("block h-full w-full object-cover object-center");
    expect(products).toContain("SellerMobileSegment");
    expect(products).toContain("flex-row");
    expect(products).toContain("sm:flex-col");
    expect(orders).toContain("SellerMobileSegment");
    expect(onboarding).toContain("Pratinjau ringkas toko");
  });
});
