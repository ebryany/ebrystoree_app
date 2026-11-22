import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { getAdminSidebarBadges, type AdminBadges } from "@/lib/admin.functions";

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

/**
 * Angka badge notifikasi/antrean real-time untuk seluruh sidebar & header admin.
 */
export function useAdminBadges(enabled: boolean): AdminBadges {
  const fetchBadges = useServerFn(getAdminSidebarBadges);

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

  if (!query.data || ("forbidden" in query.data && query.data.forbidden)) {
    return DEFAULT_ADMIN_BADGES;
  }

  return (query.data as { badges?: AdminBadges }).badges ?? DEFAULT_ADMIN_BADGES;
}
