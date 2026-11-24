import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ADMIN_BADGE_KEYS,
  clearAdminBadgeInCache,
  resolveAdminBadgeKeyForPath,
  sumAdminBadges,
} from "@/lib/admin-badges";
import type { AdminBadges } from "@/lib/admin.functions";

const SAMPLE_BADGES: AdminBadges = {
  sellers: 2,
  productModeration: 1,
  serviceModeration: 3,
  orders: 4,
  chats: 5,
  payments: 2,
  topups: 1,
  refunds: 1,
  payouts: 2,
  tasks: 3,
  fulfillment: 1,
  po: 2,
  security: 4,
};

describe("Admin Sidebar Badges — Route Resolution & Optimistic Clearing (QA)", () => {
  it("maps every badge route and its detail child routes to the exact AdminBadgeKey", () => {
    const cases: Array<[string, string]> = [
      ["/admin/seller", "sellers"],
      ["/admin/seller/", "sellers"],
      ["/admin/seller/11111111-1111-4111-8111-111111111111", "sellers"],
      ["/admin/seller/produk", "productModeration"],
      ["/admin/seller/jasa", "serviceModeration"],
      ["/admin/settings/security", "security"],
      ["/admin/orders", "orders"],
      ["/admin/orders/22222222-2222-4222-8222-222222222222", "orders"],
      ["/admin/chat", "chats"],
      ["/admin/chat/33333333-3333-4333-8333-333333333333", "chats"],
      ["/admin/payments", "payments"],
      ["/admin/payments/44444444-4444-4444-8444-444444444444", "payments"],
      ["/admin/topups", "topups"],
      ["/admin/refunds", "refunds"],
      ["/admin/refunds/55555555-5555-4555-8555-555555555555", "refunds"],
      ["/admin/payouts", "payouts"],
      ["/admin/payouts/66666666-6666-4666-8666-666666666666", "payouts"],
      ["/admin/tasks", "tasks"],
      ["/admin/tasks/77777777-7777-4777-8777-777777777777", "tasks"],
      ["/admin/pengerjaan", "fulfillment"],
      ["/admin/pengerjaan/88888888-8888-4888-8888-888888888888", "fulfillment"],
      ["/admin/po", "po"],
      ["/admin/po/99999999-9999-4999-8999-999999999999", "po"],
    ];

    for (const [pathname, expected] of cases) {
      expect(resolveAdminBadgeKeyForPath(pathname), pathname).toBe(expected);
    }
  });

  it("returns null for non-badge routes including /admin/seller/laporan so unrelated badges stay intact", () => {
    for (const pathname of [
      "/admin",
      "/admin/",
      "/admin/produk",
      "/admin/layanan",
      "/admin/artikel",
      "/admin/seller/laporan",
      "/admin/pengguna",
      "/admin/izin",
      "/admin/audit",
      "/admin/reports",
      "/admin/settings/transactions",
      "/admin/settings/website",
      "/admin/jobs",
      "/admin/notifikasi",
      "/dashboard",
    ]) {
      expect(resolveAdminBadgeKeyForPath(pathname), pathname).toBeNull();
    }
  });

  it("clears only the clicked badge key optimistically and preserves all other counters", () => {
    const prev = { forbidden: false, badges: SAMPLE_BADGES };
    const next = clearAdminBadgeInCache(prev, "orders");

    expect(next?.badges?.orders).toBe(0);
    expect(next?.badges?.sellers).toBe(2);
    expect(next?.badges?.security).toBe(4);
    expect(sumAdminBadges(SAMPLE_BADGES)).toBe(31);
    expect(sumAdminBadges(next!.badges!)).toBe(27);

    // No-op when already 0 (preserves object reference to avoid unnecessary re-renders)
    const repeat = clearAdminBadgeInCache(next, "orders");
    expect(repeat).toBe(next);
  });
});

describe("Admin Sidebar Badges — SQL Migration & Isolation Contract", () => {
  const sql = readFileSync("supabase/migrations/20261125100000_admin_badge_reads.sql", "utf8");

  it("creates per-admin admin_badge_reads table with strict RLS and all 13 badge keys", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.admin_badge_reads");
    expect(sql).toContain("PRIMARY KEY (user_id, badge_key)");
    expect(sql).toContain("ALTER TABLE public.admin_badge_reads ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.admin_badge_reads FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("USING (user_id = auth.uid())");

    for (const key of ADMIN_BADGE_KEYS) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it("defines SECURITY DEFINER mark_admin_badge_seen with permission check and monotonic timestamp", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.mark_admin_badge_seen(_badge_key text)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toContain("public.has_permission(v_user, 'admin.dashboard.view')");
    expect(sql).toContain("INVALID_BADGE_KEY");
    expect(sql).toContain("GREATEST(public.admin_badge_reads.seen_at, now())");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.mark_admin_badge_seen(text) TO authenticated",
    );
  });
});

describe("Admin Sidebar Badges — Server Query Fixes & UI Sync Contract", () => {
  it("fixes topups & payouts status filters and filters all queues by per-admin seen_at", () => {
    const src = readFileSync("src/lib/admin.functions.ts", "utf8");
    const badgeBlock = src
      .split("export const markAdminBadgeSeen =")[1]
      .split("/* Kategori")[0];

    expect(badgeBlock).toContain('.rpc("mark_admin_badge_seen"');
    expect(badgeBlock).toContain('.from("admin_badge_reads")');
    expect(badgeBlock).toContain('.eq("user_id", ctx.userId)');

    // Regression: topups uses manual + waiting_payment + proof_submitted_at IS NOT NULL (not waiting_verification)
    expect(badgeBlock).toContain('.from("credit_topups")');
    expect(badgeBlock).toContain('.eq("provider", "manual")');
    expect(badgeBlock).toContain('.not("proof_submitted_at", "is", null)');
    expect(badgeBlock).toContain('.gt("proof_submitted_at", topupsSeen)');

    // Regression: withdrawals uses real CHECK statuses (not nonexistent pending/processing)
    expect(badgeBlock).toContain('.in("status", ["requested", "approved", "needs_reconciliation"])');
    expect(badgeBlock).not.toContain('.in("status", ["pending", "processing"])');

    // Security alerts uses last_triggered_at
    expect(badgeBlock).toContain('.gt("last_triggered_at", securitySeen)');
  });

  it("wires sidebar clicks, topbar Chat Produk, active route entry, and NotificationBell invalidation", () => {
    const hookSrc = readFileSync("src/hooks/use-admin-badges.ts", "utf8");
    expect(hookSrc).toContain("markAdminBadgeSeen");
    expect(hookSrc).toContain("resolveAdminBadgeKeyForPath");
    expect(hookSrc).toContain("clearAdminBadgeInCache");

    const layoutSrc = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
    expect(layoutSrc).toContain("useAdminBadges(canEnter, pathname)");
    expect(layoutSrc).toContain("onSelectBadge={markBadgeSeen}");
    expect(layoutSrc).toContain('onClick={() => markBadgeSeen("chats")}');

    const bellSrc = readFileSync("src/components/ebry/notification-bell.tsx", "utf8");
    const readBlock = bellSrc.split("async function handleRead(")[1].split("return (")[0];
    expect(readBlock.match(/admin-sidebar-badges/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
