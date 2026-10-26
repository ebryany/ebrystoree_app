import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261002140000_order_monitoring.sql", "utf8");
const ui = readFileSync("src/components/ebry/order-monitoring.tsx", "utf8");
const server = readFileSync("src/lib/order-monitoring.functions.ts", "utf8");

describe("order monitoring regression", () => {
  it("keeps projection read-only and internal", () => {
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.order_monitoring_rows(uuid,uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("public.digital_receipt_items(o.id)");
    expect(sql).not.toContain("accepted_by");
    expect(sql).not.toContain("c.code");
    expect(sql).not.toContain("storage_path");
  });
  it("validates owner scope independently of admin permission", () => {
    expect(sql.match(/owner_id = auth.uid\(\)/g)).toHaveLength(2);
    expect(sql.match(/has_permission\(auth.uid\(\),'orders.view'\)/g)).toHaveLength(2);
    expect(sql).not.toContain("can_access_store");
    expect(sql).toContain("(_store_id IS NULL OR oi.store_id = _store_id)");
    expect(server.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(2);
    expect(server).toContain("z.string().uuid()");
    expect(server).toContain(".max(100000)");
  });
  it("uses complete SQL counts, stable paging and existing hold/reserve rules", () => {
    expect(sql).toContain("FROM filtered");
    expect(sql).toContain("LIMIT 15 OFFSET ((_page-1)*15)");
    expect(sql).toContain("p.status IN ('paid','refund_requested')");
    expect(sql).toContain("AND NOT l.has_sale");
    expect(sql).toContain("GREATEST(l.remaining,0)");
    expect(sql).toContain("WHEN active THEN 'refund_active'");
    expect(sql).toContain("status = 'paid' AND receipt_status = 'pending'");
  });
  it("has loading, error, empty, refresh and keyboard-native disclosure", () => {
    expect(ui).toContain("query.isPending");
    expect(ui).toContain("query.isError");
    expect(ui).toContain("Tidak ada pesanan pada filter ini");
    expect(ui).toContain("query.refetch()");
    expect(ui).toContain("<summary");
    expect(ui).toContain("<select");
    expect(ui).toContain("min-h-11");
    expect(ui).toContain("focus-visible:outline");
    expect(ui).not.toContain("confirmDigitalReceipt");
    expect(ui).not.toContain("credit_seller_earnings");
  });
});
