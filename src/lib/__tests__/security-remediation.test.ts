import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storeMigration = readFileSync(
  "supabase/migrations/20261004090000_protect_store_privileged_fields.sql",
  "utf8",
);
const productMigration = readFileSync(
  "supabase/migrations/20261004093000_protect_product_transaction_fields_v2.sql",
  "utf8",
);
const selfPurchase = readFileSync(
  "supabase/migrations/20261004092000_block_digital_self_purchase.sql",
  "utf8",
);
const restoreGrant = readFileSync(
  "supabase/migrations/20261004095000_store_grant_restore_for_admin.sql",
  "utf8",
);

describe("BLOCKER-1: store privileged fields (static SQL contract)", () => {
  it("installs a trigger that reverts privileged columns for non-admin", () => {
    expect(storeMigration).toContain("CREATE OR REPLACE FUNCTION public.protect_store_privileged_fields");
    expect(storeMigration).toContain("CREATE TRIGGER stores_protect_privileged");
    expect(storeMigration).toContain("BEFORE UPDATE ON public.stores");
    for (const col of [
      "NEW.status := OLD.status",
      "NEW.is_platform := OLD.is_platform",
      "NEW.reviewed_by := OLD.reviewed_by",
      "NEW.reviewed_at := OLD.reviewed_at",
      "NEW.suspended_reason := OLD.suspended_reason",
      "NEW.owner_id := OLD.owner_id",
      "NEW.slug := OLD.slug",
    ]) {
      expect(storeMigration).toContain(col);
    }
  });

  it("lets admins through so official workflows keep working", () => {
    expect(storeMigration).toContain("public.is_admin(auth.uid())");
  });

  it("restores the table grant because admins need it, with the trigger as the real boundary", () => {
    expect(restoreGrant).toContain("GRANT UPDATE ON public.stores TO authenticated");
  });
});

describe("BLOCKER-2: product transaction fields (static SQL contract)", () => {
  it("keeps sold_count and available_stock out of seller column grants", () => {
    expect(productMigration).toContain("REVOKE UPDATE ON public.digital_products FROM authenticated");
    const grant = productMigration.slice(
      productMigration.indexOf("GRANT UPDATE ("),
      productMigration.indexOf(") ON public.digital_products"),
    );
    expect(grant).not.toContain("sold_count");
    expect(grant).not.toContain("available_stock");
    expect(grant).not.toContain("moderation_status");
    expect(grant).toContain("name");
    expect(grant).toContain("price");
  });

  it("explains why available_stock is guarded by grant and not by the trigger", () => {
    // recalc_code_stock berjalan sebagai seller; memblokirnya di trigger akan mematikan stok.
    expect(productMigration).toContain("recalc_code_stock");
    expect(productMigration).toContain("TIDAK dikunci di trigger");
  });

  it("still protects sold_count on insert and update for non-admin", () => {
    expect(productMigration).toContain("NEW.sold_count := 0");
  });
});

describe("FINDING-4: digital self-purchase (static SQL contract)", () => {
  it("blocks sellers from buying their own product", () => {
    expect(selfPurchase).toContain("IF v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_PURCHASE_DENIED'; END IF;");
  });

  it("keeps the suspended-store guard and price computation intact", () => {
    expect(selfPurchase).toContain("STORE_SUSPENDED");
    expect(selfPurchase).toContain("v_fee := public.setting_int('admin_fee', 0)");
    expect(selfPurchase).toContain("v_unit := CASE WHEN v_p.discount_price");
  });

  it("preserves idempotency replay semantics", () => {
    expect(selfPurchase).toContain("idempotency_key = _idempotency_key");
    expect(selfPurchase).toContain("'duplicate', true");
  });
});

describe("verification method honesty (static contract)", () => {
  const fixture = readFileSync(".zcode/security-fix-rollback.sql", "utf8");

  it("tests privileges under the authenticated role, not as superuser", () => {
    // Management API berjalan sebagai postgres; tanpa SET ROLE, grant tidak teruji.
    expect(fixture).toContain("SET LOCAL ROLE authenticated");
    expect(fixture).toContain("RESET ROLE");
  });

  it("uses a seller-role fixture so seller RLS policies actually apply", () => {
    expect(fixture).toContain("(seller,'seller')");
  });

  it("verifies admin workflow through the official RPC, not a raw update", () => {
    expect(fixture).toContain("set_seller_suspended");
  });
});
