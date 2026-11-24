import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  clearAdminBadgeInCache,
  resolveAdminBadgeKeyForPath,
} from "@/lib/admin-badges";
import type { AdminBadgeKey } from "@/lib/admin-nav";
import {
  getAdminSidebarBadges,
  markAdminBadgeSeen,
  type AdminBadges,
} from "@/lib/admin.functions";

export const DEFAULT_ADMIN_BADGES: AdminBadges = {
  sellers: 0,
  productModeration: 0,
  serviceModeration: 0,
  orders: 0,
  chats: 0,
  payments: 0,
  topups: 0,
  refunds: 0,
  payouts: 0,
  tasks: 0,
  fulfillment: 0,
  po: 0,
  security: 0,
};

const ADMIN_BADGE_REALTIME_TABLES = [
  "notifications",
  "stores",
  "digital_products",
  "marketplace_services",
  "marketplace_service_orders",
  "orders",
  "product_inquiries",
  "payments",
  "credit_topups",
  "refunds",
  "withdrawals",
  "admin_tasks",
  "custom_orders",
  "po_payments",
  "security_alerts",
];

/** Jendela perlindungan optimistik agar refetch realtime yang sedang berjalan tidak mengedipkan angka lama. */
const SEEN_GRACE_MS = 2_000;
const MARK_THROTTLE_MS = 1_200;

/**
 * Angka badge notifikasi/antrean real-time untuk seluruh sidebar & header admin.
 *
 * Perilaku:
 * - Begitu admin mengklik menu atau memasuki halaman yang memiliki `badgeKey`,
 *   badge langsung hilang secara optimistik (0 ms) dan dicatat ke server
 *   (`admin_badge_reads.seen_at = now()`) agar tetap hilang setelah refresh.
 * - Badge muncul kembali secara real-time hanya jika ada item/notifikasi BARU
 *   yang masuk setelah `seen_at`.
 */
export function useAdminBadges(
  enabled: boolean,
  activePathname?: string,
): {
  badges: AdminBadges;
  markBadgeSeen: (badgeKey: AdminBadgeKey) => void;
} {
  const queryClient = useQueryClient();
  const fetchBadges = useServerFn(getAdminSidebarBadges);
  const persistSeen = useServerFn(markAdminBadgeSeen);
  const lastMarkedRef = useRef<Map<AdminBadgeKey, number>>(new Map());
  const visitedPathRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-sidebar-badges"],
    queryFn: () => fetchBadges({}),
    enabled,
    staleTime: 30_000,
  });

  useRealtimeRefresh({
    channel: "admin-sidebar-badges",
    tables: ADMIN_BADGE_REALTIME_TABLES,
    keys: [["admin-sidebar-badges"], ["admin-overview"], ["admin-stores"]],
    enabled,
    debounceMs: 350,
  });

  const markBadgeSeen = useCallback(
    (badgeKey: AdminBadgeKey) => {
      if (!enabled) return;
      const now = Date.now();
      const prevTs = lastMarkedRef.current.get(badgeKey) ?? 0;

      // Selalu bersihkan cache secara optimistik agar badge merah langsung hilang seketika.
      queryClient.setQueryData(
        ["admin-sidebar-badges"],
        (prev: { forbidden?: boolean; badges?: AdminBadges } | undefined) =>
          clearAdminBadgeInCache(prev, badgeKey),
      );

      if (now - prevTs < MARK_THROTTLE_MS) return;
      lastMarkedRef.current.set(badgeKey, now);

      void persistSeen({ data: { badgeKey } })
        .then((res) => {
          if (res && !("forbidden" in res && res.forbidden) && res.ok) {
            // Pastikan angka tetap 0 setelah server mencatat `seen_at`.
            queryClient.setQueryData(
              ["admin-sidebar-badges"],
              (prev: { forbidden?: boolean; badges?: AdminBadges } | undefined) =>
                clearAdminBadgeInCache(prev, badgeKey),
            );
          }
        })
        .catch(() => {
          /* fail-safe: jangan mengganggu navigasi admin */
        });
    },
    [enabled, persistSeen, queryClient],
  );

  const rawBadges: AdminBadges =
    !query.data || ("forbidden" in query.data && query.data.forbidden)
      ? DEFAULT_ADMIN_BADGES
      : ((query.data as { badges?: AdminBadges }).badges ?? DEFAULT_ADMIN_BADGES);

  const activeBadgeKey = useMemo(
    () => (activePathname ? resolveAdminBadgeKeyForPath(activePathname) : null),
    [activePathname],
  );

  // Otomatis tandai sudah dilihat saat admin masuk ke halaman menu (baik lewat klik
  // sidebar, klik notifikasi di lonceng, maupun buka URL langsung).
  useEffect(() => {
    if (!enabled || !activeBadgeKey) {
      visitedPathRef.current = activePathname ?? null;
      return;
    }

    const enteredNewRoute = visitedPathRef.current !== activePathname;
    visitedPathRef.current = activePathname ?? null;

    if (enteredNewRoute || rawBadges[activeBadgeKey] > 0) {
      markBadgeSeen(activeBadgeKey);
    }
  }, [enabled, activePathname, activeBadgeKey, rawBadges, markBadgeSeen]);

  const badges = useMemo<AdminBadges>(() => {
    const now = Date.now();
    let changed = false;
    const next: AdminBadges = { ...rawBadges };

    for (const [key, ts] of lastMarkedRef.current.entries()) {
      if (now - ts < SEEN_GRACE_MS && next[key] > 0) {
        next[key] = 0;
        changed = true;
      }
    }

    // Menu yang sedang aktif dibuka tidak perlu menampilkan bulatan merah di dirinya sendiri.
    if (activeBadgeKey && next[activeBadgeKey] > 0) {
      next[activeBadgeKey] = 0;
      changed = true;
    }

    return changed ? next : rawBadges;
  }, [rawBadges, activeBadgeKey]);

  return { badges, markBadgeSeen };
}
