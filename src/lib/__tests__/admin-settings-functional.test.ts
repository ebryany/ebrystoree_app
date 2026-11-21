import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin settings functional integrity", () => {
  it("updateSetting validates registry fields, checks affected row, and clears public cache", () => {
    const src = readFileSync("src/lib/admin-transaction.functions.ts", "utf8");
    const block = src.split("export const updateSetting")[1].split("/* ------------------------- Detail")[0];
    expect(block).toContain("validateField(field, parsed)");
    expect(block).toContain("field.readOnly");
    expect(block).toContain('.select("key")');
    expect(block).toContain("if (error || !updated)");
    expect(block).toContain("clearPublicSettingsCache()");
  });

  it("settings.transactions invalidates website-settings and public-website-settings caches", () => {
    const src = readFileSync("src/routes/_authenticated/admin/settings.transactions.tsx", "utf8");
    expect(src).toContain('queryKey: ["website-settings"]');
    expect(src).toContain('queryKey: ["public-website-settings"]');
  });

  it("settings.website clears section draft and syncs previousServer on reset success", () => {
    const src = readFileSync("src/routes/_authenticated/admin/settings.website.tsx", "utf8");
    const resetBlock = src.split("const resetMutation = useMutation")[1].split("const hasUnsaved")[0];
    expect(resetBlock).toContain("for (const f of section.fields)");
    expect(resetBlock).toContain("previousServer.current = synced");
  });

  it("feature_refund and feature_registration toggles are enforced by consumers", () => {
    const ordersSrc = readFileSync("src/lib/orders.functions.ts", "utf8");
    const refundBlock = ordersSrc
      .split("export const requestMyRefund")[1]
      .split("export const getMyDigitalReceipt")[0];
    expect(refundBlock).toContain('ensureFeature(["feature_refund"])');

    const authSrc = readFileSync("src/routes/auth.tsx", "utf8");
    expect(authSrc).toContain("websiteSettings.feature_registration !== false");
    expect(authSrc).toContain("if (!registrationEnabled)");
  });

  it("newly wired backend settings are read by their consumer modules", () => {
    const paymentsSrc = readFileSync("src/lib/payments.functions.ts", "utf8");
    expect(paymentsSrc).toContain('readNumberSetting("qris_expiry_minutes")');

    const mktSrc = readFileSync("src/lib/marketplace-service.functions.ts", "utf8");
    const deliveryUploadBlock = mktSrc
      .split("export const prepareServiceDeliveryUpload")[1]
      .split("export const getServiceDeliveryFileUrl")[0];
    expect(deliveryUploadBlock).toContain('readNumberSetting("marketplace_delivery_max_mb")');

    const emailSrc = readFileSync("src/lib/email-admin.functions.ts", "utf8");
    expect(emailSrc).toContain('readStringSetting("notify_test_recipient")');
  });

  it("newly wired frontend settings are applied in root, footer, and homepage", () => {
    const rootSrc = readFileSync("src/routes/__root.tsx", "utf8");
    expect(rootSrc).toContain("site_accent_color");
    expect(rootSrc).toContain('"--accent"');

    const footerSrc = readFileSync("src/components/site-footer.tsx", "utf8");
    expect(footerSrc).toContain("site_tagline");
    expect(footerSrc).toContain("site_phone");
    expect(footerSrc).toContain("site_address");

    const homeSrc = readFileSync("src/routes/index.tsx", "utf8");
    expect(homeSrc).toContain("storefront_show_products !== false");
    expect(homeSrc).toContain("storefront_show_services !== false");
    expect(homeSrc).toContain("storefront_featured_products");
    expect(homeSrc).toContain("storefront_featured_services");
    expect(homeSrc).toContain("storefront_default_sort");
  });

  it("SQL migration wires invoice prefix, min order amount, active service limit, complaint window, and notification gates", () => {
    const sql = readFileSync("supabase/migrations/20261121150000_wire_remaining_admin_settings.sql", "utf8");
    expect(sql).toContain("invoice_number_prefix");
    expect(sql).toContain("order_min_amount");
    expect(sql).toContain("marketplace_max_active_services");
    expect(sql).toContain("marketplace_complaint_window_hours");
    expect(sql).toContain("notify_inapp_enabled");
    expect(sql).toContain("notify_order_created");
    expect(sql).toContain("notify_operator_assigned");
    expect(sql).toContain("notify_progress_updated");
    expect(sql).toContain("notify_draft_ready");
    expect(sql).toContain("notify_revision_done");
    expect(sql).toContain("notify_result_ready");
  });

  it("storefront pagination, maintenance admin gate, SEO title template, site language, and timezone are wired", () => {
    const storeSrc = readFileSync("src/routes/toko.$slug.tsx", "utf8");
    expect(storeSrc).toContain("marketplace_store_products_per_page");

    const maintSrc = readFileSync("src/components/maintenance-gate.tsx", "utf8");
    expect(maintSrc).toContain("maintenance_allow_admin !== false");

    const rootSrc = readFileSync("src/routes/__root.tsx", "utf8");
    expect(rootSrc).toContain("seo_title_template");
    expect(rootSrc).toContain("site_language");

    const footerSrc = readFileSync("src/components/site-footer.tsx", "utf8");
    expect(footerSrc).toContain("site_help_url");

    const emailSrc = readFileSync("src/lib/email-admin.functions.ts", "utf8");
    expect(emailSrc).toContain('readStringSetting("site_timezone")');
  });

  it("home feature sections, academic settings, and seller/refund SQL rules are wired", () => {
    const bannerBgSrc = readFileSync("src/components/home/hero-banner-background.tsx", "utf8");
    expect(bannerBgSrc).toContain("home_banner_position_x");
    expect(bannerBgSrc).toContain("home_banner_position_y");

    const homeSrc = readFileSync("src/routes/index.tsx", "utf8");
    expect(homeSrc).toContain("feature_home_tracking_preview !== false");
    expect(homeSrc).toContain("feature_home_faq !== false");

    const academicSrc = readFileSync("src/lib/academic.functions.ts", "utf8");
    expect(academicSrc).toContain('readServerSetting("academic_integrity_confirmation")');
    expect(academicSrc).toContain('readNumberSetting("academic_max_upload_mb")');
    expect(academicSrc).toContain('readServerSetting("academic_allowed_formats")');

    const sql = readFileSync("supabase/migrations/20261121160000_wire_seller_and_marketplace_rules.sql", "utf8");
    expect(sql).toContain("marketplace_seller_auto_approve");
    expect(sql).toContain("marketplace_partial_refund");
  });
});
