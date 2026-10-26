import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SETTING_SECTIONS } from "../website-settings";

const perms = readFileSync("supabase/migrations/20261003250000_settings_permissions.sql", "utf8");
const binding = readFileSync(
  "supabase/migrations/20261003260000_marketplace_settings_binding.sql",
  "utf8",
);
const page = readFileSync(
  "src/routes/_authenticated/admin/settings.website.tsx",
  "utf8",
);
const registry = readFileSync("src/lib/website-settings.ts", "utf8");

describe("settings permissions (static SQL contract)", () => {
  it("registers every permission the code uses", () => {
    for (const key of [
      "settings.website.view",
      "settings.website.update",
      "settings.contact.update",
      "settings.navigation.update",
      "settings.seo.update",
      "settings.commerce.update",
      "settings.payment.update",
      "settings.features.update",
      "settings.maintenance.update",
      "settings.marketplace.update",
    ]) {
      expect(perms).toContain(`'${key}'`);
    }
  });

  it("gives admin content duties but not money or marketplace", () => {
    const adminBlock = perms.slice(
      perms.indexOf("SELECT 'admin'::public.app_role"),
      perms.indexOf("-- super_admin"),
    );
    expect(adminBlock).toContain("settings.website.update");
    expect(adminBlock).toContain("settings.seo.update");
    expect(adminBlock).not.toContain("settings.payment.update");
    expect(adminBlock).not.toContain("settings.marketplace.update");
    expect(adminBlock).not.toContain("settings.features.update");
  });

  it("gives super_admin every settings permission", () => {
    const superBlock = perms.slice(perms.indexOf("SELECT 'super_admin'::public.app_role"));
    for (const key of [
      "settings.payment.update",
      "settings.marketplace.update",
      "settings.features.update",
      "settings.maintenance.update",
      "settings.branding.update",
    ]) {
      expect(superBlock).toContain(key);
    }
  });
});

describe("marketplace settings section", () => {
  const marketplace = SETTING_SECTIONS.find((s) => s.id === "marketplace");

  it("exists with its own permission", () => {
    expect(marketplace).toBeTruthy();
    expect(marketplace?.permission).toBe("settings.marketplace.update");
  });

  it("covers media, service rules, escrow, moderation, seller and refund", () => {
    const groups = new Set(marketplace?.fields.map((f) => f.group));
    for (const group of [
      "Media & berkas jasa",
      "Aturan jasa",
      "Escrow & pencairan",
      "Moderasi",
      "Kebijakan seller",
      "Refund & sengketa",
    ]) {
      expect(groups.has(group)).toBe(true);
    }
  });

  it("keeps defaults identical to the behaviour that runs today", () => {
    const byKey = new Map(marketplace?.fields.map((f) => [f.key, f.default]));
    expect(byKey.get("marketplace_media_max")).toBe(5);
    expect(byKey.get("marketplace_image_max_mb")).toBe(5);
    expect(byKey.get("marketplace_video_max_mb")).toBe(25);
    expect(byKey.get("marketplace_delivery_max_mb")).toBe(25);
    expect(byKey.get("marketplace_max_duration_days")).toBe(365);
    expect(byKey.get("marketplace_min_requirements_chars")).toBe(10);
    expect(byKey.get("marketplace_require_moderation")).toBe(true);
    expect(byKey.get("marketplace_edit_approved_resets")).toBe(true);
    expect(byKey.get("marketplace_auto_release")).toBe(false);
  });

  it("marks database-enforced values honestly instead of faking control", () => {
    const bucket = marketplace?.fields.find((f) => f.key === "marketplace_bucket_limits");
    expect(bucket?.readOnly).toBe(true);
    expect(bucket?.enforcedInDatabase).toBe(true);
    expect(bucket?.help).toContain("migration");
  });

  it("validates ranges on every marketplace field", () => {
    for (const field of marketplace?.fields ?? []) {
      if (field.readOnly) continue;
      if (field.type === "number") {
        expect(typeof field.min).toBe("number");
        expect(typeof field.max).toBe("number");
      }
    }
  });
});

describe("settings page UI (static contract)", () => {
  it("groups fields by their group metadata", () => {
    expect(page).toContain("groupedFields");
    expect(page).toContain("field.group ?? \"\"");
    expect(page).toContain("group.name");
  });

  it("offers cross-section field search as a dropdown", () => {
    expect(page).toContain("Cari pengaturan");
    expect(page).toContain("searchResults");
    expect(page).toContain("aria-expanded={Boolean(search.trim())}");
    expect(page).toContain("Tidak ada pengaturan yang cocok.");
  });

  it("marks sections with unsaved changes in the sidebar", () => {
    expect(page).toContain("sectionDirty");
    expect(page).toContain("Ada perubahan belum disimpan");
  });

  it("labels each field as public or internal, and changed from default", () => {
    expect(page).toContain("Tampil di situs");
    expect(page).toContain("Internal");
    expect(page).toContain("Diubah dari default");
    expect(page).toContain("Ditegakkan database");
  });

  it("shows an impact summary as an overlay dialog before saving risky sections", () => {
    expect(page).toContain("RISKY_SECTIONS");
    expect(page).toContain('new Set(["transaksi", "fitur", "maintenance", "marketplace"])');
    expect(page).toContain("Periksa dampak sebelum menyimpan");
    expect(page).toContain("Ya, terapkan perubahan");
    expect(page).toContain("<Dialog open={impactOpen}");
    expect(page).toContain("DialogContent");
  });

  it("keeps accessibility and touch targets", () => {
    expect(page).toContain('aria-label="Cari pengaturan"');
    expect(page).toContain("aria-current");
    expect(page).toContain("focus-visible:outline");
    expect(page).toContain("min-h-11");
  });
});

describe("marketplace limits bound to settings (static SQL contract)", () => {
  it("reads configured limits in the RPC with safe defaults", () => {
    expect(binding).toContain("public.setting_int('marketplace_media_max', 5)");
    expect(binding).toContain("public.setting_int('marketplace_image_max_mb', 5)");
    expect(binding).toContain("public.setting_int('marketplace_video_max_mb', 25)");
    expect(binding).toContain("public.setting_int('marketplace_max_duration_days', 365)");
  });

  it("rejects out-of-range configuration instead of trusting it", () => {
    expect(binding).toContain("INVALID_CHECKOUT_SETTINGS");
    expect(binding).toContain("v_media_max NOT BETWEEN 1 AND 10");
    expect(binding).toContain("v_duration_max NOT BETWEEN 1 AND 3650");
  });

  it("keeps the immutable hard cap because CHECK cannot read settings", () => {
    expect(binding).toContain("IMMUTABLE");
    expect(binding).toContain("jsonb_array_length(_media) > 10 THEN false");
    expect(binding).toContain("20971520");
    expect(binding).toContain("104857600");
    expect(registry).toContain("enforcedInDatabase");
  });

  it("enforces configured duration in the RPC", () => {
    expect(binding).toContain("DURATION_EXCEEDS_LIMIT");
    expect(binding).toContain("> v_duration_max");
  });
});

describe("action feedback with pop up (static contract)", () => {
  const dialog = readFileSync("src/components/admin/action-result-dialog.tsx", "utf8");

  it("provides four result statuses with animated icons", () => {
    for (const status of ["loading", "success", "error", "partial"]) {
      expect(dialog).toContain(`${status}:`);
    }
    expect(dialog).toContain("AnimatePresence");
    expect(dialog).toContain("useReducedMotion");
    expect(dialog).toContain("Loader2");
    expect(dialog).toContain("CheckCircle2");
  });

  it("never auto-closes on a destructive result and keeps retry context", () => {
    expect(dialog).toContain("result.status === \"error\" && result.retry");
    expect(dialog).toContain("aria-busy={busy}");
    expect(dialog).toContain("if (busy) event.preventDefault()");
    expect(dialog).toContain("Memproses…");
  });

  it("offers a real follow-up action after success", () => {
    expect(dialog).toContain("result.actions ?? []");
    expect(dialog).toContain("action.onClick");
    expect(page).toContain("Lihat audit");
    expect(page).toContain('to: "/admin/audit"');
  });

  it("shows the result dialog for both save and reset outcomes", () => {
    expect(page).toContain("<ActionResultDialog");
    expect(page).toContain("Pengaturan gagal disimpan");
    expect(page).toContain("Reset gagal dijalankan");
    expect(page).toContain("retry: { label: \"Coba lagi\"");
  });

  it("replaces window.confirm with a readable confirmation dialog", () => {
    expect(page).not.toContain("window.confirm");
    expect(page).toContain("confirmResetOpen");
    expect(page).toContain("Kembalikan ke nilai default?");
    expect(page).toContain("Ya, reset ke default");
  });

  it("animates the floating save bar and the search dropdown", () => {
    expect(page).toContain("AnimatePresence");
    expect(page).toMatch(/motion\.div[\s\S]*sticky bottom-0/);
    expect(page).toMatch(/motion\.div[\s\S]*absolute left-0 right-0 top-full/);
    expect(page).toContain("reduced ? false :");
  });

  it("keeps touch targets and keyboard accessibility", () => {
    expect(page).toContain("min-h-11");
    expect(dialog).toContain("min-h-11");
    expect(dialog).toContain("onEscapeKeyDown");
  });
});
