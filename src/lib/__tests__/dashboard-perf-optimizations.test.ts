import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard performance optimization contracts", () => {
  it("breaks the accidental Recharts dependency in tx-ui.tsx", () => {
    const txUi = readFileSync("src/components/admin/tx-ui.tsx", "utf8");
    expect(txUi).not.toMatch(/from\s+["'][^"']*report-charts/);
    expect(txUi).not.toMatch(/from\s+["']recharts["']/);
    expect(txUi).toContain("var(--chart-1)");
  });

  it("lazy-loads Recharts trend chart on seller overview instead of static import", () => {
    const sellerIndex = readFileSync("src/routes/_authenticated/seller.index.tsx", "utf8");
    expect(sellerIndex).not.toContain('from "recharts"');
    expect(sellerIndex).toContain('import("@/components/seller/seller-trend-chart")');
    expect(sellerIndex).toContain("Suspense");
  });

  it("removes motion/react layout thrashing from heavy seller list routes", () => {
    for (const file of [
      "src/routes/_authenticated/seller.pesanan.tsx",
      "src/components/seller/seller-order-card.tsx",
      "src/routes/_authenticated/seller.jasa-pesanan.tsx",
      "src/components/seller/service-order-card.tsx",
      "src/routes/_authenticated/seller.keuangan.tsx",
      "src/routes/_authenticated/seller.chat.index.tsx",
      "src/components/seller/marketplace-service-catalog.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} should not import motion/react`).not.toContain('from "motion/react"');
      expect(src, `${file} should not override refetchOnWindowFocus: "always"`).not.toContain(
        'refetchOnWindowFocus: "always"',
      );
    }
  });

  it("avoids initial-mount double-fetch storm in useRealtimeRefresh", () => {
    const src = readFileSync("src/hooks/use-realtime-refresh.ts", "utf8");
    expect(src).toContain("let needsResync = false;");
    expect(src).toContain('if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")');
    expect(src).toContain("resyncOnJoin = false");
    expect(src).toContain("if (needsResync || resyncOnJoin) schedule(true)");
    expect(src).toContain("MIN_HIDDEN_RESYNC_MS");
  });

  it("uses singleton external store in useSession and cached session in _authenticated beforeLoad", () => {
    const hook = readFileSync("src/hooks/use-session.ts", "utf8");
    const authRoute = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    expect(hook).toContain("useSyncExternalStore");
    expect(hook).toContain("export function getCachedSession()");
    expect(authRoute).toContain("getCachedSession()");
  });

  it("parallelizes payment helper reads inside getMyOrder", () => {
    const orders = readFileSync("src/lib/orders.functions.ts", "utf8");
    const start = orders.indexOf("export const getMyOrder");
    const end = orders.indexOf("/* ---------------- Aksi pelanggan ---------------- */");
    const fn = orders.slice(start, end);
    expect(fn).toContain("helpers.loadManualAccount(),");
    expect(fn).toContain("helpers.loadPaymentInstruction(sb),");
    expect(fn).toContain("helpers.loadPaymentMethods(),");
    expect(fn).not.toContain("const account = await helpers.loadManualAccount()");
  });

  it("defines below-the-fold content-visibility utilities with @supports fallback in styles.css", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@utility cv-row");
    expect(css).toContain("@utility cv-card");
    expect(css).toContain("contain-intrinsic-size: auto none auto 72px");
    expect(css).toContain("contain-intrinsic-size: auto none auto 260px");
    expect(css).toContain("@supports not (content-visibility: auto)");
  });

  it("hoists useStorePresence once in SellerLayout instead of 4 duplicate OwnPresence instances", () => {
    const sellerLayout = readFileSync("src/routes/_authenticated/seller.tsx", "utf8");
    expect(sellerLayout).not.toContain("function OwnPresence");
    expect(sellerLayout).toContain("const ownPresence = useStorePresence(");
  });
});
