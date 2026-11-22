import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  claimNotificationToast,
  extractSafeNotificationSummary,
  isAdminSellerNotificationType,
  reconcileNotifications,
  typesForSellerFilter,
  type AdminSellerNotificationFilter,
  type AdminSellerNotificationItem,
  type RawSellerNotificationRow,
} from "@/lib/admin-seller-notifications";
import {
  listAdminSellerNotifications,
  markAdminSellerNotificationRead,
  markAllAdminSellerNotificationsRead,
  type AdminSellerCategoryCounts,
  type ListAdminSellerNotificationsResult,
} from "@/lib/admin-seller-notifications.functions";
import { pushNotificationToast } from "@/components/ebry/notification-toast";

export type AdminSellerRealtimeStatus =
  | "connecting"
  | "subscribed"
  | "reconnecting"
  | "error"
  | "offline";

type Options = {
  enabled?: boolean;
  filter?: AdminSellerNotificationFilter;
  pageSize?: number;
  userId?: string | null;
};

const EMPTY_COUNTS: AdminSellerCategoryCounts = {
  all: 0,
  registration: 0,
  verification: 0,
  activity: 0,
};

export function mapAdminSellerRealtimeStatus(
  status: string,
): AdminSellerRealtimeStatus | null {
  if (status === "SUBSCRIBED") return "subscribed";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") return "reconnecting";
  if (status === "CLOSED") return "error";
  return null;
}

function matchesFilter(
  item: AdminSellerNotificationItem,
  filter: AdminSellerNotificationFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return item.readAt === null;
  const allowed = typesForSellerFilter(filter);
  return allowed ? allowed.includes(item.type) : true;
}

export function sellerNotificationQueryKey(
  userId: string | null | undefined,
  filter: AdminSellerNotificationFilter,
) {
  return ["admin-seller-notifications", userId ?? "anon", filter] as const;
}

type RealtimePayload = {
  eventType: string;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
};

export type AdminSellerRealtimeControllerDeps = {
  userId: string;
  channelName: string;
  queryClient: QueryClient;
  client: typeof supabase;
  initialIds: Set<string>;
  sessionNewIds: Set<string>;
  scheduleStoreSync: (storeId?: string | null) => void;
  onPulse: () => void;
  onToast: (item: AdminSellerNotificationItem) => void;
  onStatusChange: (status: AdminSellerRealtimeStatus) => void;
};

/**
 * Pengendali siklus hidup subscription Supabase Realtime untuk notifikasi admin seller.
 * Dipisahkan agar lifecycle reconnect, deduplikasi event, dan sinkronisasi cache
 * dapat diverifikasi secara deterministik baik di browser maupun test integrasi.
 */
export function createAdminSellerRealtimeController({
  userId,
  channelName,
  queryClient,
  client,
  initialIds,
  sessionNewIds,
  scheduleStoreSync,
  onPulse,
  onToast,
  onStatusChange,
}: AdminSellerRealtimeControllerDeps) {
  let active = true;
  let needsResync = false;
  let hiddenAt: number | null = null;
  const MIN_HIDDEN_RESYNC_MS = 20_000;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    onStatusChange("offline");
    needsResync = true;
  } else {
    onStatusChange("connecting");
  }

  const resyncAll = () => {
    if (!active) return;
    void queryClient.invalidateQueries({
      queryKey: ["admin-seller-notifications", userId],
    });
    scheduleStoreSync();
  };

  const handlePayload = (payload: RealtimePayload) => {
    if (!active) return;
    const row = (payload.new ?? payload.old) as RawSellerNotificationRow | null;
    if (!row || !isAdminSellerNotificationType(row.type)) return;

    if (payload.eventType === "INSERT" && payload.new) {
      const alreadyLoaded = initialIds.has(row.id);
      initialIds.add(row.id);

      const normalized = extractSafeNotificationSummary(
        payload.new as RawSellerNotificationRow,
        undefined,
        { isNew: !alreadyLoaded },
      );

      if (!alreadyLoaded) {
        sessionNewIds.add(normalized.id);
        onPulse();
        if (claimNotificationToast(normalized.id)) {
          onToast(normalized);
        }
      }

      const cached = queryClient.getQueriesData<ListAdminSellerNotificationsResult>({
        queryKey: ["admin-seller-notifications", userId],
      });

      for (const [key, prev] of cached) {
        if (!prev || prev.forbidden) continue;
        const targetFilter = (key[2] as AdminSellerNotificationFilter) ?? "all";
        const existsInCache = prev.items.some((entry) => entry.id === normalized.id);
        const nextItems = matchesFilter(normalized, targetFilter)
          ? reconcileNotifications(prev.items, [normalized])
          : prev.items;

        const isUnread = normalized.readAt === null && !existsInCache;
        const nextUnread = isUnread ? prev.unreadCount + 1 : prev.unreadCount;
        const nextCatCounts: AdminSellerCategoryCounts = isUnread
          ? {
              ...prev.categoryCounts,
              all: prev.categoryCounts.all + 1,
              [normalized.category]: prev.categoryCounts[normalized.category] + 1,
            }
          : prev.categoryCounts;

        queryClient.setQueryData<ListAdminSellerNotificationsResult>(key, {
          ...prev,
          items: nextItems,
          unreadCount: nextUnread,
          categoryCounts: nextCatCounts,
        });
      }

      void queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
      scheduleStoreSync(normalized.storeId);
      return;
    }

    if (payload.eventType === "UPDATE" && payload.new) {
      const updated = extractSafeNotificationSummary(
        payload.new as RawSellerNotificationRow,
        undefined,
        { isNew: sessionNewIds.has(row.id) },
      );
      const wasRead = payload.old?.read_at ? true : false;
      const nowRead = Boolean(updated.readAt);
      const delta = payload.old ? (wasRead === nowRead ? 0 : nowRead ? -1 : 1) : 0;

      const cached = queryClient.getQueriesData<ListAdminSellerNotificationsResult>({
        queryKey: ["admin-seller-notifications", userId],
      });

      for (const [key, prev] of cached) {
        if (!prev || prev.forbidden) continue;
        const targetFilter = (key[2] as AdminSellerNotificationFilter) ?? "all";
        let nextItems = prev.items.map((entry) =>
          entry.id === updated.id
            ? {
                ...entry,
                readAt: updated.readAt,
                title: updated.title,
                message: updated.message,
              }
            : entry,
        );
        if (targetFilter === "unread" && nowRead) {
          nextItems = nextItems.filter((entry) => entry.id !== updated.id);
        }
        const nextUnread = Math.max(0, prev.unreadCount + delta);
        const nextCategory = Math.max(0, prev.categoryCounts[updated.category] + delta);
        queryClient.setQueryData<ListAdminSellerNotificationsResult>(key, {
          ...prev,
          items: nextItems,
          unreadCount: nextUnread,
          categoryCounts: {
            ...prev.categoryCounts,
            all: nextUnread,
            [updated.category]: nextCategory,
          },
        });
      }

      if (!payload.old) {
        void queryClient.invalidateQueries({
          queryKey: ["admin-seller-notifications", userId],
        });
      }
    }
  };

  const handleSubscribeStatus = (status: string) => {
    if (!active) return;
    const mapped = mapAdminSellerRealtimeStatus(status);
    if (mapped) onStatusChange(mapped);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      needsResync = true;
    } else if (status === "SUBSCRIBED" && needsResync) {
      needsResync = false;
      resyncAll();
    }
  };

  const ch = client.channel(channelName);
  ch.on(
    "postgres_changes" as any,
    {
      event: "*",
      schema: "public",
      table: "notifications",
      filter: `recipient_id=eq.${userId}`,
    } as any,
    handlePayload,
  );
  ch.subscribe(handleSubscribeStatus);

  const { data: authSub } = client.auth.onAuthStateChange((event) => {
    if (!active) return;
    if (event === "SIGNED_OUT") {
      onStatusChange("error");
      return;
    }
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      resyncAll();
    }
  });

  const onVisible = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_RESYNC_MS) {
        resyncAll();
      }
      hiddenAt = null;
      return;
    }
    hiddenAt = Date.now();
  };

  const onOffline = () => {
    needsResync = true;
    if (active) onStatusChange("offline");
  };

  const onOnline = () => {
    if (active) onStatusChange("reconnecting");
    resyncAll();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
  }

  return {
    handlePayload,
    handleSubscribeStatus,
    stop: () => {
      active = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      }
      authSub.subscription.unsubscribe();
      client.removeChannel(ch);
    },
  };
}

/**
 * Kelola daftar, counter unread, aksi read/unread, paginasi, toast, dan
 * langganan Supabase Realtime untuk Admin Seller Notification Center.
 */
export function useAdminSellerNotifications({
  enabled = true,
  filter = "all",
  pageSize = 15,
  userId: userIdOverride,
}: Options = {}) {
  const { user } = useSession();
  const resolvedUserId = userIdOverride !== undefined ? userIdOverride : (user?.id ?? null);
  const canRun = Boolean(enabled && resolvedUserId);
  const qc = useQueryClient();
  const instanceId = useId();
  const sound = useNotificationSound();
  const playRef = useRef(sound.play);
  playRef.current = sound.play;

  const fetchList = useServerFn(listAdminSellerNotifications);
  const markReadFn = useServerFn(markAdminSellerNotificationRead);
  const markAllFn = useServerFn(markAllAdminSellerNotificationsRead);

  const [connectionStatus, setConnectionStatus] =
    useState<AdminSellerRealtimeStatus>("connecting");
  const [pulse, setPulse] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const initialIdsRef = useRef<Set<string>>(new Set());
  const sessionNewIdsRef = useRef<Set<string>>(new Set());
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStoreIdsRef = useRef<Set<string>>(new Set());

  const queryKey = sellerNotificationQueryKey(resolvedUserId, filter);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchList({ data: { filter, limit: pageSize, offset: 0 } }),
    enabled: canRun,
    staleTime: 20_000,
  });

  // Catat semua ID dari backend agar notifikasi lama tidak memicu toast saat mount/resync.
  useEffect(() => {
    const rows = query.data?.items;
    if (!rows?.length) return;
    for (const item of rows) {
      initialIdsRef.current.add(item.id);
    }
  }, [query.data?.items]);

  const scheduleStoreSync = useCallback(
    (storeId?: string | null) => {
      if (storeId) pendingStoreIdsRef.current.add(storeId);
      if (storeSyncTimerRef.current) clearTimeout(storeSyncTimerRef.current);
      storeSyncTimerRef.current = setTimeout(() => {
        storeSyncTimerRef.current = null;
        void qc.invalidateQueries({ queryKey: ["admin-stores"] });
        for (const sid of pendingStoreIdsRef.current) {
          void qc.invalidateQueries({ queryKey: ["admin-store", sid] });
        }
        pendingStoreIdsRef.current.clear();
      }, 250);
    },
    [qc],
  );

  useEffect(() => {
    if (!canRun || !resolvedUserId) {
      setConnectionStatus("offline");
      return;
    }

    const controller = createAdminSellerRealtimeController({
      userId: resolvedUserId,
      channelName: `admin-seller-notifications:${instanceId}`,
      queryClient: qc,
      client: supabase,
      initialIds: initialIdsRef.current,
      sessionNewIds: sessionNewIdsRef.current,
      scheduleStoreSync,
      onPulse: () => {
        setPulse(true);
        if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = setTimeout(() => setPulse(false), 1800);
      },
      onToast: (normalized) => {
        playRef.current();
        pushNotificationToast({
          id: normalized.id,
          title: normalized.title,
          message: normalized.storeName
            ? `${normalized.storeName} — ${normalized.message}`
            : normalized.message,
          type: normalized.type,
          href: normalized.actionUrl ?? "/admin/seller",
          actionLabel: normalized.storeExists ? "Buka detail seller" : undefined,
        });
      },
      onStatusChange: setConnectionStatus,
    });

    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      if (storeSyncTimerRef.current) clearTimeout(storeSyncTimerRef.current);
      controller.stop();
    };
  }, [canRun, instanceId, qc, resolvedUserId, scheduleStoreSync]);

  const items = useMemo(() => {
    const raw = query.data?.items ?? [];
    return raw.map((item) =>
      sessionNewIdsRef.current.has(item.id) && !item.isNew ? { ...item, isNew: true } : item,
    );
  }, [query.data?.items]);

  const markAsRead = useCallback(
    async (id: string, read = true): Promise<boolean> => {
      if (!resolvedUserId) return false;
      const nowIso = read ? new Date().toISOString() : null;
      const snapshots = qc.getQueriesData<ListAdminSellerNotificationsResult>({
        queryKey: ["admin-seller-notifications", resolvedUserId],
      });

      let targetItem: AdminSellerNotificationItem | undefined;
      for (const [, data] of snapshots) {
        targetItem = data?.items.find((entry) => entry.id === id);
        if (targetItem) break;
      }

      const wasUnread = targetItem ? targetItem.readAt === null : read;
      const delta = read ? (wasUnread ? -1 : 0) : !wasUnread ? 1 : 0;

      for (const [key, prev] of snapshots) {
        if (!prev || prev.forbidden) continue;
        const targetFilter = (key[2] as AdminSellerNotificationFilter) ?? "all";
        let nextItems = prev.items.map((entry) =>
          entry.id === id
            ? { ...entry, readAt: nowIso, isNew: read ? false : entry.isNew }
            : entry,
        );
        if (targetFilter === "unread" && read) {
          nextItems = nextItems.filter((entry) => entry.id !== id);
        }
        const nextUnread = Math.max(0, prev.unreadCount + delta);
        const cat = targetItem?.category;
        qc.setQueryData<ListAdminSellerNotificationsResult>(key, {
          ...prev,
          items: nextItems,
          unreadCount: nextUnread,
          categoryCounts: cat
            ? {
                ...prev.categoryCounts,
                all: nextUnread,
                [cat]: Math.max(0, prev.categoryCounts[cat] + delta),
              }
            : { ...prev.categoryCounts, all: nextUnread },
        });
      }

      if (read) sessionNewIdsRef.current.delete(id);

      try {
        const res = await markReadFn({ data: { id, read } });
        if (!res || "forbidden" in res || !res.ok) {
          throw new Error((res as any)?.error ?? "Gagal memperbarui status notifikasi.");
        }
        void qc.invalidateQueries({ queryKey: ["my-notifications"] });
        return true;
      } catch {
        for (const [key, prev] of snapshots) {
          qc.setQueryData(key, prev);
        }
        toast.error("Gagal memperbarui status notifikasi. Silakan coba lagi.");
        return false;
      }
    },
    [markReadFn, qc, resolvedUserId],
  );

  const markAllRead = useCallback(async (): Promise<boolean> => {
    if (!resolvedUserId) return false;
    const categoryOnly =
      filter === "registration" || filter === "verification" || filter === "activity"
        ? filter
        : "all";
    const nowIso = new Date().toISOString();
    const snapshots = qc.getQueriesData<ListAdminSellerNotificationsResult>({
      queryKey: ["admin-seller-notifications", resolvedUserId],
    });

    for (const [key, prev] of snapshots) {
      if (!prev || prev.forbidden) continue;
      const targetFilter = (key[2] as AdminSellerNotificationFilter) ?? "all";
      const nextItems = prev.items
        .map((entry) =>
          categoryOnly === "all" || entry.category === categoryOnly
            ? { ...entry, readAt: entry.readAt ?? nowIso, isNew: false }
            : entry,
        )
        .filter((entry) => targetFilter !== "unread" || entry.readAt === null);

      const nextCategoryCounts: AdminSellerCategoryCounts =
        categoryOnly === "all"
          ? { ...EMPTY_COUNTS }
          : {
              ...prev.categoryCounts,
              [categoryOnly]: 0,
              all: Math.max(0, prev.unreadCount - prev.categoryCounts[categoryOnly]),
            };

      qc.setQueryData<ListAdminSellerNotificationsResult>(key, {
        ...prev,
        items: nextItems,
        unreadCount: nextCategoryCounts.all,
        categoryCounts: nextCategoryCounts,
      });
    }

    if (categoryOnly === "all") sessionNewIdsRef.current.clear();

    try {
      const res = await markAllFn({ data: { filter: categoryOnly } });
      if (!res || "forbidden" in res || !res.ok) {
        throw new Error((res as any)?.error ?? "Gagal menandai semua notifikasi.");
      }
      void qc.invalidateQueries({ queryKey: ["my-notifications"] });
      void qc.invalidateQueries({ queryKey: ["admin-seller-notifications", resolvedUserId] });
      return true;
    } catch {
      for (const [key, prev] of snapshots) {
        qc.setQueryData(key, prev);
      }
      toast.error("Gagal menandai semua notifikasi.");
      return false;
    }
  }, [filter, markAllFn, qc, resolvedUserId]);

  const loadMore = useCallback(async () => {
    const nextOffset = query.data?.nextOffset;
    if (!canRun || !resolvedUserId || nextOffset == null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchList({ data: { filter, limit: pageSize, offset: nextOffset } });
      if (res.error || res.forbidden) {
        toast.error(res.error ?? "Gagal memuat notifikasi lainnya.");
        return;
      }
      for (const item of res.items) {
        initialIdsRef.current.add(item.id);
      }
      qc.setQueryData<ListAdminSellerNotificationsResult>(queryKey, (prev) => {
        if (!prev) return res;
        return {
          ...res,
          items: reconcileNotifications(prev.items, res.items),
        };
      });
    } catch {
      toast.error("Gagal memuat notifikasi lainnya.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    canRun,
    fetchList,
    filter,
    isLoadingMore,
    pageSize,
    qc,
    query.data?.nextOffset,
    queryKey,
    resolvedUserId,
  ]);

  return {
    items,
    unreadCount: query.data?.unreadCount ?? 0,
    categoryCounts: query.data?.categoryCounts ?? EMPTY_COUNTS,
    hasMore: Boolean(query.data?.hasMore),
    isPending: query.isPending,
    isFetching: query.isFetching,
    isLoadingMore,
    forbidden: Boolean(query.data?.forbidden),
    error: query.error ? "Notifikasi seller tidak dapat dimuat." : (query.data?.error ?? null),
    connectionStatus,
    pulse,
    soundEnabled: sound.enabled,
    toggleSound: sound.toggle,
    refetch: query.refetch,
    loadMore,
    markAsRead,
    markAllRead,
  };
}
