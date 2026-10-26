import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/_authenticated/seller.pesanan.tsx", "utf8");
const card = readFileSync("src/components/seller/seller-order-card.tsx", "utf8");

describe("seller order page redesign (static source contract)", () => {
  it("uses monitoring as the single source and removes duplicate lists", () => {
    expect(page).toContain("listOrderMonitoring");
    expect(page).toContain('scope: "seller"');
    expect(page).not.toContain("OrderMonitoringList");
    expect(page).not.toContain("SegmentedFilter");
    expect(page).not.toContain("listSellerOrders");
  });
  it("renders status tabs with real server counts", () => {
    expect(page).toContain('countKey: "delivery_blocked"');
    expect(page).toContain('countKey: "awaiting_receipt"');
    expect(page).toContain('countKey: "refund_active"');
    expect(page).toContain("CountUp");
    expect(page).toContain('useState<(typeof TABS)[number]["key"]>("actions")');
  });
  it("keeps realtime trigger, pagination and accessible skeleton", () => {
    expect(page).toContain("useRealtimeRefresh");
    expect(page).toContain('tables: ["notifications"]');
    expect(page).toContain("Halaman");
    expect(page).toContain('role="status"');
    expect(page).toContain('aria-label="Memuat pesanan"');
  });
  it("animates cards and honors reduced motion", () => {
    expect(card).toContain('from "motion/react"');
    expect(card).toContain("useReducedMotion");
    expect(card).toContain("AnimatePresence");
    expect(card).toContain("Kelola produk");
    expect(card).toContain("Rincian dana");
    expect(card).toContain("aria-label={`Pesanan ${row.order_number}`}");
  });
});
