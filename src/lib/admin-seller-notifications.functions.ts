import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ADMIN_SELLER_NOTIFICATION_PREFIX,
  extractSafeNotificationSummary,
  SELLER_ACTIVITY_TYPES,
  SELLER_REGISTRATION_TYPES,
  SELLER_VERIFICATION_TYPES,
  typesForSellerFilter,
  type AdminSellerNotificationFilter,
  type AdminSellerNotificationItem,
  type RawSellerNotificationRow,
  type StoreLookupEntry,
} from "./admin-seller-notifications";

type Ctx = { supabase: any; userId: string };

const authz = () => import("./authz.server");

async function guard<T>(
  context: Ctx,
  permission: string,
  run: () => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

export type AdminSellerCategoryCounts = {
  all: number;
  registration: number;
  verification: number;
  activity: number;
};

export type ListAdminSellerNotificationsResult = {
  forbidden?: true;
  permission?: string;
  items: AdminSellerNotificationItem[];
  unreadCount: number;
  categoryCounts: AdminSellerCategoryCounts;
  hasMore: boolean;
  nextOffset: number | null;
  error: string | null;
};

const EMPTY_COUNTS: AdminSellerCategoryCounts = {
  all: 0,
  registration: 0,
  verification: 0,
  activity: 0,
};

const FILTER_SCHEMA = z.enum(["all", "unread", "registration", "verification", "activity"]);

/** Daftar notifikasi seller khusus admin terotorisasi (per-admin & paginasi). */
export const listAdminSellerNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        filter: FILTER_SCHEMA.default("all"),
        limit: z.number().int().min(1).max(50).default(15),
        offset: z.number().int().min(0).max(500).default(0),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<ListAdminSellerNotificationsResult> => {
    const ctx = context as Ctx;
    try {
      await (await authz()).assertPermission(ctx, "sellers.view");
    } catch {
      return {
        forbidden: true,
        permission: "sellers.view",
        items: [],
        unreadCount: 0,
        categoryCounts: { ...EMPTY_COUNTS },
        hasMore: false,
        nextOffset: null,
        error: null,
      };
    }

    const sb = ctx.supabase;
    const filter = data.filter as AdminSellerNotificationFilter;

    let listQuery = sb
      .from("notifications")
      .select(
        "id, type, title, message, related_type, related_id, dedupe_key, event_ref, action_url, metadata, read_at, created_at",
      )
      .eq("recipient_id", ctx.userId)
      .like("type", `${ADMIN_SELLER_NOTIFICATION_PREFIX}%`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.offset, data.offset + data.limit);

    if (filter === "unread") {
      listQuery = listQuery.is("read_at", null);
    } else {
      const types = typesForSellerFilter(filter);
      if (types) {
        listQuery = listQuery.in("type", [...types]);
      }
    }

    const [listRes, allUnreadRes, regUnreadRes, verUnreadRes, actUnreadRes] = await Promise.all([
      listQuery,
      sb
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_id", ctx.userId)
        .like("type", `${ADMIN_SELLER_NOTIFICATION_PREFIX}%`)
        .is("read_at", null),
      sb
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_id", ctx.userId)
        .in("type", [...SELLER_REGISTRATION_TYPES])
        .is("read_at", null),
      sb
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_id", ctx.userId)
        .in("type", [...SELLER_VERIFICATION_TYPES])
        .is("read_at", null),
      sb
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_id", ctx.userId)
        .in("type", [...SELLER_ACTIVITY_TYPES])
        .is("read_at", null),
    ]);

    if (listRes.error) {
      return {
        items: [] as AdminSellerNotificationItem[],
        unreadCount: 0,
        categoryCounts: { ...EMPTY_COUNTS },
        hasMore: false,
        nextOffset: null,
        error: "Notifikasi seller tidak dapat dimuat.",
      };
    }

    const rawRows = (listRes.data ?? []) as RawSellerNotificationRow[];
    const hasMore = rawRows.length > data.limit;
    const pageRows = hasMore ? rawRows.slice(0, data.limit) : rawRows;

    // Ambil status & nama terkini toko terkait melalui relasi berizin (tanpa duplikasi PII).
    const storeIds = new Set<string>();
    for (const r of pageRows) {
      if (r.related_type === "store" && typeof r.related_id === "string") {
        storeIds.add(r.related_id);
      } else if (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)) {
        const sid = (r.metadata as Record<string, unknown>).store_id;
        if (typeof sid === "string") storeIds.add(sid);
      }
    }

    let storeLookup: Map<string, StoreLookupEntry> | null = null;
    if (storeIds.size > 0) {
      const { data: storesData, error: storesError } = await sb
        .from("stores")
        .select("id, name, slug")
        .in("id", [...storeIds]);
      if (!storesError && Array.isArray(storesData)) {
        storeLookup = new Map<string, StoreLookupEntry>();
        for (const s of storesData) {
          storeLookup.set(String(s.id), {
            id: String(s.id),
            name: typeof s.name === "string" ? s.name : null,
            slug: typeof s.slug === "string" ? s.slug : null,
          });
        }
      }
    }

    const items = pageRows.map((row) => extractSafeNotificationSummary(row, storeLookup));
    const allUnread = Number(allUnreadRes.count ?? 0);

    return {
      items,
      unreadCount: allUnread,
      categoryCounts: {
        all: allUnread,
        registration: Number(regUnreadRes.count ?? 0),
        verification: Number(verUnreadRes.count ?? 0),
        activity: Number(actUnreadRes.count ?? 0),
      },
      hasMore,
      nextOffset: hasMore ? data.offset + pageRows.length : null,
      error: null,
    };
  });

/** Hitung ringkas jumlah notifikasi seller yang belum dibaca milik admin saat ini. */
export const getAdminSellerUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const ctx = context as Ctx;
      const { count, error } = await ctx.supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_id", ctx.userId)
        .like("type", `${ADMIN_SELLER_NOTIFICATION_PREFIX}%`)
        .is("read_at", null);
      if (error) return { unreadCount: 0, error: "Jumlah notifikasi tidak dapat dimuat." };
      return { unreadCount: Number(count ?? 0), error: null };
    }),
  );

/** Tandai satu notifikasi seller sebagai dibaca atau belum dibaca (hanya milik sendiri). */
export const markAdminSellerNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        read: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const ctx = context as Ctx;
      const readAt = data.read ? new Date().toISOString() : null;
      const { error } = await ctx.supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", data.id)
        .eq("recipient_id", ctx.userId)
        .like("type", `${ADMIN_SELLER_NOTIFICATION_PREFIX}%`);
      if (error) return { ok: false as const, error: "Gagal memperbarui status notifikasi." };
      return { ok: true as const, readAt, error: null };
    }),
  );

/** Tandai semua notifikasi seller belum dibaca sebagai dibaca (opsional per kategori). */
export const markAllAdminSellerNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        filter: z.enum(["all", "registration", "verification", "activity"]).default("all"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const ctx = context as Ctx;
      const readAt = new Date().toISOString();
      let q = ctx.supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("recipient_id", ctx.userId)
        .is("read_at", null);

      const types = typesForSellerFilter(data.filter);
      if (types) {
        q = q.in("type", [...types]);
      } else {
        q = q.like("type", `${ADMIN_SELLER_NOTIFICATION_PREFIX}%`);
      }

      const { error } = await q;
      if (error) return { ok: false as const, error: "Gagal menandai seluruh notifikasi." };
      return { ok: true as const, readAt, error: null };
    }),
  );
