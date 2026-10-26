import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { mapRealtimeStatus, realtimeStatusKey } from "./use-realtime-refresh";

const hook = readFileSync("src/hooks/use-realtime-refresh.ts", "utf8");

describe("realtime status mapping", () => {
  it("maps subscribe states to connection status", () => {
    expect(mapRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(mapRealtimeStatus("CHANNEL_ERROR")).toBe("reconnecting");
    expect(mapRealtimeStatus("TIMED_OUT")).toBe("reconnecting");
    expect(mapRealtimeStatus("CLOSED")).toBe("error");
    expect(mapRealtimeStatus("JOINED")).toBeNull();
  });
  it("exposes a stable status query key per channel", () => {
    expect(realtimeStatusKey("seller-orders")).toEqual(["realtime-status", "seller-orders"]);
  });
});

describe("realtime hook contract (static source, not websocket execution)", () => {
  it("keeps cleanup, debounce and resync intact", () => {
    expect(hook).toContain("supabase.removeChannel(ch)");
    expect(hook).toContain("setTimeout(flush, debounceMs)");
    expect(hook).toContain('document.visibilityState === "visible"');
    expect(hook).toContain('window.addEventListener("online", onOnline)');
    expect(hook).toContain("eventRef.current?.(payload)");
  });
  it("schedules resync when subscription succeeds", () => {
    const subscribe = hook.slice(
      hook.indexOf("ch.subscribe"),
      hook.indexOf("// Segarkan saat tab"),
    );
    expect(subscribe).toContain('status === "SUBSCRIBED"');
    expect(subscribe).toContain("schedule()");
  });
  it("passes filter to postgres_changes only when provided", () => {
    expect(hook).toContain("...(filter ? { filter } : {})");
  });
});

describe("realtime page coverage (RLS-aware wiring)", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("seller pages use notifications as the trigger, never orders", () => {
    for (const path of [
      "src/routes/_authenticated/seller.index.tsx",
      "src/routes/_authenticated/seller.pesanan.tsx",
      "src/routes/_authenticated/seller.keuangan.tsx",
    ]) {
      const page = read(path);
      expect(page).toContain('tables: ["notifications"]');
      expect(page).toContain("recipient_id=eq.${user.id}");
      expect(page).not.toMatch(/tables: \["orders"/);
    }
  });
  it("seller products listen to their own catalog rows", () => {
    const page = read("src/routes/_authenticated/seller.produk.index.tsx");
    expect(page).toContain('tables: ["digital_products"]');
    expect(page).toContain('keys: [["my-store-products"], ["my-inventory-summary"]]');
  });
  it("buyer order list listens to own orders only", () => {
    const page = read("src/routes/_authenticated/dashboard.pesanan.index.tsx");
    expect(page).toContain('tables: ["orders"]');
    expect(page).toContain("user_id=eq.${user.id}");
  });
  it("service pages listen to service tables with the right keys", () => {
    const catalog = read("src/components/seller/marketplace-service-catalog.tsx");
    expect(catalog).toContain('tables: ["marketplace_services"]');
    expect(catalog).toContain('keys: [["my-marketplace-services"]]');
    const orders = read("src/routes/_authenticated/seller.jasa-pesanan.tsx");
    expect(orders).toContain('"marketplace_service_orders"');
    expect(orders).toContain('"marketplace_service_deliveries"');
    expect(orders).toContain('"marketplace_service_events"');
    expect(orders).toContain('keys: [["my-service-orders"], ["seller-service-order"]]');
    const admin = read("src/routes/_authenticated/admin/seller.jasa.tsx");
    expect(admin).toContain('tables: ["marketplace_services"]');
    expect(admin).toContain('tables: ["marketplace_service_orders"]');
    expect(admin).toContain('keys: [["marketplace-service-moderation"]]');
    expect(admin).toContain('keys: [["service-complaints"]]');
  });
  it("notification bell is unified into the shared hook", () => {
    const bell = read("src/components/ebry/notification-bell.tsx");
    expect(bell).toContain("useRealtimeRefresh({");
    expect(bell).toContain("recipient_id=eq.${user.id}");
    expect(bell).not.toContain("supabase.channel(");
    expect(bell).toContain("pushNotificationToast");
  });
});
