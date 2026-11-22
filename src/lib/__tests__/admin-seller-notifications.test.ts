import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  toastCustom: vi.fn(),
  toastError: vi.fn(),
  canSellersView: true,
  hookState: {
    items: [] as any[],
    unreadCount: 0,
    categoryCounts: { all: 0, registration: 0, verification: 0, activity: 0 },
    hasMore: false,
    isPending: false,
    isFetching: false,
    isLoadingMore: false,
    forbidden: false,
    error: null as string | null,
    connectionStatus: "subscribed" as const,
    pulse: false,
    soundEnabled: true,
    toggleSound: vi.fn(),
    refetch: vi.fn(),
    loadMore: vi.fn(),
    markAsRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock("@/lib/authz.server", () => ({
  assertPermission: hoisted.assertPermission,
}));

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: vi.fn(),
}));

vi.mock("@/lib/rate-limit.server", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "aaaa1111-1111-4111-8111-111111111111" }, loading: false }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: (input: { data: unknown; context: unknown }) => unknown) => handler,
    };
    return builder;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  createFileRoute: () => (opts: any) => ({ ...opts, options: opts }),
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));

vi.mock("sonner", () => ({
  toast: {
    custom: hoisted.toastCustom,
    error: hoisted.toastError,
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/components/admin/admin-ui", async () => {
  const actual = await vi.importActual<typeof import("@/components/admin/admin-ui")>(
    "@/components/admin/admin-ui",
  );
  return {
    ...actual,
    useCan: () => hoisted.canSellersView,
  };
});

import {
  claimNotificationToast,
  classifySellerNotification,
  extractSafeNotificationSummary,
  formatUnreadBadge,
  reconcileNotifications,
  resetClaimedNotificationToasts,
  resolveSellerNotificationHref,
} from "@/lib/admin-seller-notifications";
import {
  getAdminSellerUnreadCount,
  listAdminSellerNotifications,
  markAdminSellerNotificationRead,
  markAllAdminSellerNotificationsRead,
  type ListAdminSellerNotificationsResult,
} from "@/lib/admin-seller-notifications.functions";
import { listStoresForAdmin } from "@/lib/admin-seller.functions";
import {
  createAdminSellerRealtimeController,
  mapAdminSellerRealtimeStatus,
  sellerNotificationQueryKey,
} from "@/hooks/use-admin-seller-notifications";
import { SellerNotificationCenter } from "@/components/admin/seller-notification-center";
import { notificationHref, notificationTone } from "@/components/ebry/notification-meta";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "aaaa1111-1111-4111-8111-111111111111";
const ADMIN_B = "bbbb2222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "cccc3333-3333-4333-8333-333333333333";

function makeMockSupabase(rows: any[], stores: any[] = [{ id: STORE_ID, name: "Toko Maju", slug: "toko-maju" }]) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, unknown]>; update?: unknown }> = [];

  const createQuery = (table: string) => {
    const state = {
      op: "select",
      filters: [] as Array<[string, unknown]>,
      head: false,
      count: false,
      inCol: null as string | null,
      inVals: [] as unknown[],
      likePrefix: null as string | null,
      isNullCol: null as string | null,
      rangeFrom: 0,
      rangeTo: 99,
      updateVal: null as unknown,
    };

    const execute = () => {
      calls.push({ table, op: state.op, filters: state.filters, update: state.updateVal });
      if (table === "stores") {
        let filtered = [...stores];
        if (state.inCol === "id") {
          filtered = filtered.filter((s) => state.inVals.includes(s.id));
        }
        return { data: filtered, count: filtered.length, error: null };
      }

      let filtered = rows.filter((r) => {
        for (const [k, v] of state.filters) {
          if (r[k] !== v) return false;
        }
        if (state.likePrefix && !String(r.type ?? "").startsWith(state.likePrefix)) return false;
        if (state.inCol && !state.inVals.includes(r[state.inCol])) return false;
        if (state.isNullCol && r[state.isNullCol] !== null && r[state.isNullCol] !== undefined) {
          return false;
        }
        return true;
      });

      if (state.op === "update" && state.updateVal) {
        filtered.forEach((r) => Object.assign(r, state.updateVal));
        return { data: filtered, count: filtered.length, error: null };
      }

      filtered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const sliced = state.head ? [] : filtered.slice(state.rangeFrom, state.rangeTo + 1);
      return { data: sliced, count: filtered.length, error: null };
    };

    const q: Record<string, any> = {
      select: (_cols: string, opts?: { head?: boolean; count?: string }) => {
        state.head = Boolean(opts?.head);
        state.count = opts?.count === "exact";
        return q;
      },
      update: (val: unknown) => {
        state.op = "update";
        state.updateVal = val;
        return q;
      },
      eq: (col: string, val: unknown) => {
        state.filters.push([col, val]);
        return q;
      },
      like: (col: string, pattern: string) => {
        if (col === "type") state.likePrefix = pattern.replace(/%$/, "");
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        state.inCol = col;
        state.inVals = vals;
        return q;
      },
      is: (col: string, val: unknown) => {
        if (val === null) state.isNullCol = col;
        return q;
      },
      order: () => q,
      range: (from: number, to: number) => {
        state.rangeFrom = from;
        state.rangeTo = to;
        return q;
      },
      then: (resolve: (val: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return q;
  };

  return {
    calls,
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: (table: string) => createQuery(table),
  };
}

function makeFakeRealtimeSupabase() {
  let changeHandler: ((payload: any) => void) | null = null;
  let subscribeHandler: ((status: string) => void) | null = null;
  let authHandler: ((event: string) => void) | null = null;

  const channelObj = {
    on: vi.fn((_ev: string, _cfg: any, cb: (p: any) => void) => {
      changeHandler = cb;
      return channelObj;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subscribeHandler = cb;
      return channelObj;
    }),
  };

  const unsubscribe = vi.fn();
  const client = {
    channel: vi.fn(() => channelObj),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn((cb: (ev: string) => void) => {
        authHandler = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };

  return {
    client: client as any,
    channelObj,
    unsubscribe,
    emitChange: (payload: any) => changeHandler?.(payload),
    emitSubscribe: (status: string) => subscribeHandler?.(status),
    emitAuth: (event: string) => authHandler?.(event),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetClaimedNotificationToasts();
  hoisted.assertPermission.mockResolvedValue(undefined);
  hoisted.canSellersView = true;
});

describe("Database Migration Contract — Seller Admin Event Triggers & Multi-Admin Fanout", () => {
  const migrationSql = readFileSync(
    "supabase/migrations/20261122140000_admin_seller_notification_center.sql",
    "utf8",
  );

  it("extends notifications additively with deduplication unique partial index & realtime publication", () => {
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS dedupe_key text");
    expect(migrationSql).toContain("uq_notifications_recipient_dedupe");
    expect(migrationSql).toContain("ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL");
    expect(migrationSql).toContain("ALTER TABLE public.stores REPLICA IDENTITY FULL");
    expect(migrationSql).toContain("ARRAY['notifications', 'stores']");
  });

  it("fans out notifications per eligible admin with sellers.view or super_admin and revokes public execution", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.notify_seller_admins");
    expect(migrationSql).toContain("rp.permission_key = 'sellers.view'");
    expect(migrationSql).toContain("ur.role = 'super_admin'");
    expect(migrationSql).toContain("REVOKE ALL ON FUNCTION public.notify_seller_admins");
  });

  it("covers all seller business events without copying private contact values or breaking apply_as_seller", () => {
    for (const evType of [
      "admin_seller.registered",
      "admin_seller.auto_approved",
      "admin_seller.reapplied",
      "admin_seller.status_approved",
      "admin_seller.status_rejected",
      "admin_seller.status_suspended",
      "admin_seller.status_reactivated",
      "admin_seller.status_pending",
      "admin_seller.profile_updated",
      "admin_seller.product_submitted",
      "admin_seller.service_submitted",
    ]) {
      expect(migrationSql).toContain(`'${evType}'`);
    }
    expect(migrationSql).not.toContain("FUNCTION public.apply_as_seller");
    expect(migrationSql).not.toContain("NEW.contact_phone::text");
  });
});

describe("Test 1, 2, 4, 5 & 8 — Seller Event Domain Classification, Unread Badge, Deduplication & Safe Navigation", () => {
  it("classifies registration, verification, and seller activity events accurately", () => {
    expect(classifySellerNotification("admin_seller.registered").category).toBe("registration");
    expect(classifySellerNotification("admin_seller.auto_approved").category).toBe("registration");
    expect(classifySellerNotification("admin_seller.reapplied").category).toBe("verification");
    expect(classifySellerNotification("admin_seller.status_approved").category).toBe("verification");
    expect(classifySellerNotification("admin_seller.product_submitted").category).toBe("activity");
    expect(classifySellerNotification("admin_seller.service_submitted").category).toBe("activity");
    expect(notificationTone("admin_seller.status_rejected").label).toBe("Seller");
    expect(notificationHref({ type: "admin_seller.registered", related_type: "store", related_id: STORE_ID }, true)).toEqual({
      to: "/admin/seller/$id",
      params: { id: STORE_ID },
    });
  });

  it("formats unread counters with hidden 0, exact 1..99, and 99+ cap", () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(-3)).toBeNull();
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(99)).toBe("99");
    expect(formatUnreadBadge(100)).toBe("99+");
    expect(formatUnreadBadge(250)).toBe("99+");
  });

  it("validates safe internal /admin/seller paths and handles deleted/missing stores cleanly", () => {
    expect(
      resolveSellerNotificationHref({
        action_url: `/admin/seller/${STORE_ID}`,
        related_type: "store",
        related_id: STORE_ID,
      }),
    ).toBe(`/admin/seller/${STORE_ID}`);

    // Reject open-redirect / non-admin URLs
    expect(
      resolveSellerNotificationHref({
        action_url: "https://evil.example/phish",
        related_type: "store",
        related_id: STORE_ID,
      }),
    ).toBe(`/admin/seller/${STORE_ID}`);

    const missingStoreLookup = new Map<string, { id: string; name?: string | null }>();
    const item = extractSafeNotificationSummary(
      {
        id: "n-missing",
        type: "admin_seller.registered",
        title: "Pendaftaran seller baru",
        message: "Toko Lama mendaftar.",
        related_type: "store",
        related_id: STORE_ID,
        action_url: `/admin/seller/${STORE_ID}`,
        metadata: { store_id: STORE_ID, store_name: "Toko Lama" },
        created_at: "2026-11-22T01:00:00Z",
      },
      missingStoreLookup,
    );
    expect(item.storeExists).toBe(false);
    expect(item.actionUrl).toBe("/admin/seller");
  });

  it("reconciles out-of-order and duplicate notifications without producing double entries or double toasts", () => {
    const older = extractSafeNotificationSummary({
      id: "n-1",
      type: "admin_seller.registered",
      title: "Pendaftaran seller baru",
      message: "Toko A mendaftar",
      dedupe_key: "k-1",
      created_at: "2026-11-22T01:00:00Z",
    });
    const newer = extractSafeNotificationSummary({
      id: "n-2",
      type: "admin_seller.product_submitted",
      title: "Produk seller perlu moderasi",
      message: "Produk baru",
      dedupe_key: "k-2",
      created_at: "2026-11-22T02:00:00Z",
    });
    const dupByDedupe = { ...older, id: "n-1-dup", title: "Pendaftaran seller baru" };

    // Simulasi event datang tidak berurutan (newer masuk duluan, lalu older + duplikat)
    const merged = reconcileNotifications([newer], [older, dupByDedupe, newer]);
    expect(merged.map((m) => m.id)).toEqual(["n-2", "n-1"]);

    expect(claimNotificationToast("toast-1")).toBe(true);
    expect(claimNotificationToast("toast-1")).toBe(false);
  });
});

describe("Test 3, 4 & 7 — Backend API, Multi-Admin Independence & Authorization", () => {
  it("blocks customer and unauthorized seller from all admin seller notification endpoints (Test 7)", async () => {
    hoisted.assertPermission.mockRejectedValue(new Error("FORBIDDEN"));
    const sb = makeMockSupabase([]);

    const listRes = await (listAdminSellerNotifications as any)({
      data: { filter: "all", limit: 15, offset: 0 },
      context: { supabase: sb, userId: CUSTOMER_ID },
    });
    expect(listRes.forbidden).toBe(true);
    expect(listRes.items).toEqual([]);

    const countRes = await (getAdminSellerUnreadCount as any)({
      context: { supabase: sb, userId: CUSTOMER_ID },
    });
    expect(countRes.forbidden).toBe(true);

    const markRes = await (markAdminSellerNotificationRead as any)({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", read: true },
      context: { supabase: sb, userId: CUSTOMER_ID },
    });
    expect(markRes.forbidden).toBe(true);

    const markAllRes = await (markAllAdminSellerNotificationsRead as any)({
      data: { filter: "all" },
      context: { supabase: sb, userId: CUSTOMER_ID },
    });
    expect(markAllRes.forbidden).toBe(true);
  });

  it("keeps unread counts & read_at independent per admin and persists read status across reloads (Test 3 & 4)", async () => {
    const dbRows = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        recipient_id: ADMIN_A,
        type: "admin_seller.registered",
        title: "Pendaftaran seller baru",
        message: 'Toko "Toko Maju" mendaftar.',
        related_type: "store",
        related_id: STORE_ID,
        action_url: `/admin/seller/${STORE_ID}`,
        dedupe_key: `admin_seller:registered:${STORE_ID}`,
        event_ref: `store:${STORE_ID}`,
        metadata: { store_id: STORE_ID, store_name: "Toko Maju", store_slug: "toko-maju" },
        read_at: null,
        created_at: "2026-11-22T02:00:00Z",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        recipient_id: ADMIN_B,
        type: "admin_seller.registered",
        title: "Pendaftaran seller baru",
        message: 'Toko "Toko Maju" mendaftar.',
        related_type: "store",
        related_id: STORE_ID,
        action_url: `/admin/seller/${STORE_ID}`,
        dedupe_key: `admin_seller:registered:${STORE_ID}`,
        event_ref: `store:${STORE_ID}`,
        metadata: { store_id: STORE_ID, store_name: "Toko Maju", store_slug: "toko-maju" },
        read_at: null,
        created_at: "2026-11-22T02:00:00Z",
      },
    ];

    const sbA = makeMockSupabase(dbRows);
    const sbB = makeMockSupabase(dbRows);

    // Admin A menandai miliknya dibaca
    const marked = await (markAdminSellerNotificationRead as any)({
      data: { id: dbRows[0].id, read: true },
      context: { supabase: sbA, userId: ADMIN_A },
    });
    expect(marked.ok).toBe(true);

    // Query Admin A -> unread 0, Query Admin B -> masih unread 1 (persisten & independen)
    const afterA = await (listAdminSellerNotifications as any)({
      data: { filter: "all", limit: 15, offset: 0 },
      context: { supabase: sbA, userId: ADMIN_A },
    });
    const afterB = await (listAdminSellerNotifications as any)({
      data: { filter: "all", limit: 15, offset: 0 },
      context: { supabase: sbB, userId: ADMIN_B },
    });

    expect(afterA.unreadCount).toBe(0);
    expect(afterA.items[0].readAt).toBeTruthy();
    expect(afterB.unreadCount).toBe(1);
    expect(afterB.items[0].readAt).toBeNull();
  });

  it("filters notifications strictly by category and supports markAllRead scoped to recipient", async () => {
    const dbRows = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        recipient_id: ADMIN_A,
        type: "admin_seller.registered",
        title: "Pendaftaran seller baru",
        message: "Baru",
        related_type: "store",
        related_id: STORE_ID,
        metadata: { store_id: STORE_ID, store_name: "Toko Maju" },
        read_at: null,
        created_at: "2026-11-22T02:00:00Z",
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        recipient_id: ADMIN_A,
        type: "admin_seller.product_submitted",
        title: "Produk seller perlu moderasi",
        message: "Produk",
        related_type: "store",
        related_id: STORE_ID,
        metadata: {
          store_id: STORE_ID,
          store_name: "Toko Maju",
          moderation_url: "/admin/seller/produk",
        },
        read_at: null,
        created_at: "2026-11-22T03:00:00Z",
      },
    ];
    const sb = makeMockSupabase(dbRows);

    const regOnly = await (listAdminSellerNotifications as any)({
      data: { filter: "registration", limit: 15, offset: 0 },
      context: { supabase: sb, userId: ADMIN_A },
    });
    expect(regOnly.items).toHaveLength(1);
    expect(regOnly.items[0].type).toBe("admin_seller.registered");
    expect(regOnly.unreadCount).toBe(2);
    expect(regOnly.categoryCounts).toEqual({ all: 2, registration: 1, verification: 0, activity: 1 });

    await (markAllAdminSellerNotificationsRead as any)({
      data: { filter: "registration" },
      context: { supabase: sb, userId: ADMIN_A },
    });
    const unreadAfter = await (getAdminSellerUnreadCount as any)({
      context: { supabase: sb, userId: ADMIN_A },
    });
    expect(unreadAfter.unreadCount).toBe(1);
  });
});

describe("Test 1, 5 & 6 — Realtime Delivery, Reconnect Resync, Deduplication & Store Sync", () => {
  it("updates QueryClient cache on new realtime event, prevents duplicate/initial toasts, and resyncs on reconnect", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fake = makeFakeRealtimeSupabase();

    const oldItem = extractSafeNotificationSummary({
      id: "old-1",
      type: "admin_seller.registered",
      title: "Seller lama",
      message: "Sudah dimuat awal",
      created_at: "2026-11-22T01:00:00Z",
    });

    const initialPayload: ListAdminSellerNotificationsResult = {
      items: [oldItem],
      unreadCount: 1,
      categoryCounts: { all: 1, registration: 1, verification: 0, activity: 0 },
      hasMore: false,
      nextOffset: null,
      error: null,
    };

    qc.setQueryData(sellerNotificationQueryKey(ADMIN_A, "all"), initialPayload);
    qc.setQueryData(sellerNotificationQueryKey(ADMIN_A, "verification"), {
      ...initialPayload,
      items: [],
    });

    const initialIds = new Set<string>(["old-1"]);
    const sessionNewIds = new Set<string>();
    const scheduleStoreSync = vi.fn();
    const onPulse = vi.fn();
    const onToast = vi.fn();
    const onStatusChange = vi.fn();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const controller = createAdminSellerRealtimeController({
      userId: ADMIN_A,
      channelName: "admin-seller-test",
      queryClient: qc,
      client: fake.client,
      initialIds,
      sessionNewIds,
      scheduleStoreSync,
      onPulse,
      onToast,
      onStatusChange,
    });

    expect(mapAdminSellerRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(mapAdminSellerRealtimeStatus("CHANNEL_ERROR")).toBe("reconnecting");
    expect(mapAdminSellerRealtimeStatus("TIMED_OUT")).toBe("reconnecting");
    expect(mapAdminSellerRealtimeStatus("CLOSED")).toBe("error");

    fake.emitSubscribe("SUBSCRIBED");
    expect(onStatusChange).toHaveBeenCalledWith("subscribed");
    // Initial subscribe must NOT trigger toast or extra resync
    expect(onToast).not.toHaveBeenCalled();

    // Re-emitted old notification -> ignored for toast & no duplicates
    fake.emitChange({
      eventType: "INSERT",
      new: {
        id: "old-1",
        recipient_id: ADMIN_A,
        type: "admin_seller.registered",
        title: "Seller lama",
        message: "Sudah dimuat awal",
        created_at: "2026-11-22T01:00:00Z",
      },
      old: null,
    });
    expect(onToast).not.toHaveBeenCalled();

    // New verification event arrives in realtime
    const livePayload = {
      eventType: "INSERT",
      new: {
        id: "live-new-1",
        recipient_id: ADMIN_A,
        type: "admin_seller.reapplied",
        title: "Pengajuan ulang seller",
        message: 'Toko "Toko Maju" mengajukan peninjauan ulang.',
        related_type: "store",
        related_id: STORE_ID,
        action_url: `/admin/seller/${STORE_ID}`,
        metadata: { store_id: STORE_ID, store_name: "Toko Maju" },
        read_at: null,
        created_at: "2026-11-22T02:30:00Z",
      },
      old: null,
    };

    fake.emitChange(livePayload);
    // Repeated event with same ID must not double-toast or double-count
    fake.emitChange(livePayload);

    expect(onPulse).toHaveBeenCalledOnce();
    expect(onToast).toHaveBeenCalledOnce();
    expect(scheduleStoreSync).toHaveBeenCalledWith(STORE_ID);

    const allCache = qc.getQueryData<ListAdminSellerNotificationsResult>(
      sellerNotificationQueryKey(ADMIN_A, "all"),
    );
    expect(allCache?.items).toHaveLength(2);
    expect(allCache?.items[0].id).toBe("live-new-1");
    expect(allCache?.items[0].isNew).toBe(true);
    expect(allCache?.unreadCount).toBe(2);
    expect(allCache?.categoryCounts.verification).toBe(1);

    const verCache = qc.getQueryData<ListAdminSellerNotificationsResult>(
      sellerNotificationQueryKey(ADMIN_A, "verification"),
    );
    expect(verCache?.items).toHaveLength(1);
    expect(verCache?.items[0].id).toBe("live-new-1");

    // Simulate disconnect + reconnect gap reconciliation (Test 6)
    invalidateSpy.mockClear();
    const syncCallsBeforeReconnect = scheduleStoreSync.mock.calls.length;
    fake.emitSubscribe("CHANNEL_ERROR");
    expect(onStatusChange).toHaveBeenCalledWith("reconnecting");

    fake.emitSubscribe("SUBSCRIBED");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["admin-seller-notifications", ADMIN_A],
    });
    expect(scheduleStoreSync).toHaveBeenCalledTimes(syncCallsBeforeReconnect + 1);

    controller.stop();
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.client.removeChannel).toHaveBeenCalledOnce();
  });
});

describe("Test 9 — UI Integration & /admin/seller Regression Contracts", () => {
  it("computes per-status store counts cleanly in listStoresForAdmin without breaking items contract", async () => {
    const sb = makeMockSupabase(
      [],
      [
        { id: "1", status: "pending" },
        { id: "2", status: "pending" },
        { id: "3", status: "active" },
        { id: "4", status: "suspended" },
        { id: "5", status: "rejected" },
      ],
    );
    sb.rpc.mockResolvedValue({ data: [{ id: "1", name: "Toko Baru", status: "pending" }], error: null });

    const res = await (listStoresForAdmin as any)({
      data: { status: "pending", search: "" },
      context: { supabase: sb, userId: ADMIN_A },
    });

    expect(res.items).toHaveLength(1);
    expect(res.counts).toEqual({ all: 5, pending: 2, active: 1, suspended: 1, rejected: 1 });
  });

  it("mounts SellerNotificationCenter cleanly on /admin/seller and /admin/seller/$id preserving filters & DecisionPanel", () => {
    const sellerIndexSrc = readFileSync("src/routes/_authenticated/admin/seller.index.tsx", "utf8");
    const sellerDetailSrc = readFileSync("src/routes/_authenticated/admin/seller.$id.tsx", "utf8");
    const centerSrc = readFileSync("src/components/admin/seller-notification-center.tsx", "utf8");

    expect(sellerIndexSrc).toContain("<SellerNotificationCenter />");
    expect(sellerIndexSrc).toContain("DecisionPanel");
    expect(sellerIndexSrc).toContain("placeholderData: keepPreviousData");
    expect(sellerIndexSrc).toContain("useDeferredValue");
    expect(sellerIndexSrc).toContain('tables: ["stores"]');

    expect(sellerDetailSrc).toContain("<SellerNotificationCenter />");
    expect(sellerDetailSrc).toContain("ApplicationDecisionPanel");
    expect(sellerDetailSrc).toContain("SuspendPanel");

    expect(centerSrc).toContain("SELLER_NOTIFICATION_FILTERS");
    expect(centerSrc).toContain("formatUnreadBadge");
    expect(centerSrc).toContain("ebry-notif-live");
    expect(centerSrc).toContain("Lihat semua notifikasi");

    // Verify real SellerNotificationCenter SSR output with 105 unread items -> "99+" badge
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(sellerNotificationQueryKey(ADMIN_A, "all"), {
      items: [],
      unreadCount: 105,
      categoryCounts: { all: 105, registration: 2, verification: 1, activity: 102 },
      hasMore: false,
      nextOffset: null,
      error: null,
    });
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(SellerNotificationCenter),
      ),
    );
    expect(html).toContain('aria-label="Notifikasi seller, 105 belum dibaca"');
    expect(html).toContain("99+");
    expect(html).toContain('id="ebry-notif-live"');

    // Without sellers.view permission, SellerNotificationCenter renders empty
    hoisted.canSellersView = false;
    const deniedHtml = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(SellerNotificationCenter),
      ),
    );
    expect(deniedHtml).toBe("");
  });
});
