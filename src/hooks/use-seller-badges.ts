import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listSellerInquiries } from "@/lib/inquiries.functions";
import { listMyServiceOrders } from "@/lib/marketplace-service.functions";
import { listOrderMonitoring } from "@/lib/order-monitoring.functions";
import { countServiceOrders } from "@/lib/seller-service-order-ui";

export type SellerBadges = {
  /** Pesanan produk yang pengirimannya tertahan dan perlu tindakan seller. */
  orders: number;
  /** Pesanan jasa yang menunggu langkah seller. */
  serviceOrders: number;
  /** Chat pembeli berstatus open (belum dijawab). */
  chats: number;
};

/**
 * Angka badge navigasi seller. Query key sama dengan halaman Ringkasan, Pesanan
 * Jasa, dan Chat, jadi cache dipakai bersama dan tidak ada request ganda.
 */
export function useSellerBadges(enabled: boolean): SellerBadges {
  const fetchMonitoring = useServerFn(listOrderMonitoring);
  const fetchServiceOrders = useServerFn(listMyServiceOrders);
  const fetchInquiries = useServerFn(listSellerInquiries);

  const monitoringQ = useQuery({
    queryKey: ["seller-monitoring", "actions", 1],
    queryFn: () => fetchMonitoring({ data: { scope: "seller", filter: "actions", page: 1 } }),
    enabled,
    staleTime: 60_000,
  });
  const serviceQ = useQuery({
    queryKey: ["my-service-orders"],
    queryFn: () => fetchServiceOrders({}),
    enabled,
    staleTime: 60_000,
  });
  const inquiriesQ = useQuery({
    queryKey: ["seller-inquiries", "all"],
    queryFn: () => fetchInquiries({ data: { status: "all" } }),
    enabled,
    staleTime: 60_000,
  });

  const inquiries =
    (inquiriesQ.data as { items?: Array<{ status: string }> } | undefined)?.items ?? [];

  return {
    orders: monitoringQ.data?.counts?.delivery_blocked ?? 0,
    serviceOrders: serviceQ.data ? countServiceOrders(serviceQ.data.items ?? []).needs_action : 0,
    chats: inquiries.filter((i) => i.status === "open").length,
  };
}
