import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, RefreshCw } from "lucide-react";

import {
  SellerAlertBanner,
  SellerMobileSegment,
  SellerPageHeader,
} from "@/components/seller/seller-ui";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { ServiceOrderCard } from "@/components/seller/service-order-card";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listMyServiceOrders } from "@/lib/marketplace-service.functions";
import {
  SERVICE_ORDER_TABS,
  countServiceComplaints,
  countServiceOrders,
  filterServiceOrders,
  type ServiceOrderTabKey,
} from "@/lib/seller-service-order-ui";

export const Route = createFileRoute("/_authenticated/seller/jasa-pesanan")({
  head: () => ({
    meta: [{ title: "Pesanan Jasa | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: SellerServiceOrders,
});

const EMPTY_HINT: Record<ServiceOrderTabKey, string> = {
  needs_action: "Tidak ada yang perlu ditindak sekarang. Semua pesanan sedang menunggu pembeli.",
  in_progress: "Tidak ada pesanan yang sedang dikerjakan.",
  revision: "Tidak ada permintaan revisi.",
  awaiting_buyer: "Tidak ada hasil yang sedang ditinjau pembeli.",
  all: "Pesanan jasa akan muncul di sini setelah pembeli menyelesaikan checkout.",
};

function SellerServiceOrders() {
  const [tab, setTab] = useState<ServiceOrderTabKey>("needs_action");
  const [expanded, setExpanded] = useState<string | null>(null);
  const fetchOrders = useServerFn(listMyServiceOrders);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["my-service-orders"],
    queryFn: () => fetchOrders({}),
  });
  useRealtimeRefresh({
    channel: "my-service-orders",
    tables: [
      "marketplace_service_orders",
      "marketplace_service_deliveries",
      "marketplace_service_events",
    ],
    keys: [["my-service-orders"], ["seller-service-order"]],
  });

  const allItems = useMemo(() => data?.items ?? [], [data?.items]);
  const counts = useMemo(() => countServiceOrders(allItems), [allItems]);
  const complaints = useMemo(() => countServiceComplaints(allItems), [allItems]);
  const filtered = useMemo(() => filterServiceOrders(allItems, tab), [allItems, tab]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <SellerMobileSegment
        ariaLabel="Pilih jenis pesanan"
        items={[
          { to: "/seller/pesanan", label: "Pesanan Produk" },
          { to: "/seller/jasa-pesanan", label: "Pesanan Jasa" },
        ]}
      />

      <SellerPageHeader
        title="Pesanan jasa"
        description="Kerjakan dari tab Perlu tindakan. Dana ditahan sampai pembeli menerima hasil pekerjaan."
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="min-h-11">
              <Link to="/seller/jasa">Kelola jasa saya</Link>
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={isFetching ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              Muat ulang
            </Button>
          </>
        }
      />

      {complaints > 0 ? (
        <SellerAlertBanner tone="danger" title="Pesanan dalam komplain">
          {complaints} pesanan sedang dikomplain. Pencairan dana dibekukan sampai admin memutuskan.
        </SellerAlertBanner>
      ) : null}

      <div
        role="tablist"
        aria-label="Filter status pesanan jasa"
        data-cols="5"
        className="seller-queue-grid overflow-hidden rounded-[var(--radius-panel)] border border-border shadow-[var(--elev-1)]"
      >
        {SERVICE_ORDER_TABS.map((entry) => {
          const active = tab === entry.key;
          const count = counts[entry.key];
          const urgent = (entry.key === "needs_action" || entry.key === "revision") && count > 0;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className={cn(
                "seller-queue-tab flex min-h-[74px] flex-col items-start justify-between gap-1.5 bg-card p-3 text-left transition-colors hover:bg-surface active:bg-surface sm:min-h-[88px] sm:gap-2 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active && "bg-surface-selected hover:bg-surface-selected",
              )}
            >
              <span
                className={cn(
                  "text-xl font-bold leading-none tabular-nums sm:text-2xl",
                  urgent ? "text-destructive" : "text-foreground",
                )}
              >
                {data ? count.toLocaleString("id-ID") : "-"}
              </span>
              <span
                className={cn(
                  "text-xs",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {entry.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {SERVICE_ORDER_TABS.find((entry) => entry.key === tab)?.hint}
      </p>

      {isPending ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState
          title="Pesanan jasa gagal dimuat"
          description={error.message}
          onRetry={() => void refetch()}
        />
      ) : data && filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tab === "all" ? "Belum ada pesanan jasa" : "Tidak ada pesanan di filter ini"}
          description={EMPTY_HINT[tab]}
        />
      ) : data ? (
        <section aria-label="Daftar pesanan jasa" className="space-y-3">
          {filtered.map((row, index) => (
            <ServiceOrderCard
              key={row.order_id}
              row={row}
              index={index}
              isExpanded={expanded === row.order_id}
              onToggle={() => setExpanded(expanded === row.order_id ? null : row.order_id)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
