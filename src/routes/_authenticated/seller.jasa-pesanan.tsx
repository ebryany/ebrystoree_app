import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, FileText } from "lucide-react";

import { CountUp } from "@/components/admin/report-widgets";
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
  const reduced = useReducedMotion();
  const fetchOrders = useServerFn(listMyServiceOrders);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-service-orders"],
    queryFn: () => fetchOrders({}),
    refetchOnWindowFocus: "always",
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

  const allItems = data?.items ?? [];
  const counts = countServiceOrders(allItems);
  const complaints = countServiceComplaints(allItems);
  const filtered = filterServiceOrders(allItems, tab);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Pesanan jasa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kerjakan dari tab Perlu tindakan. Dana ditahan sampai pembeli menerima hasil.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/seller/jasa">Kelola jasa saya</Link>
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={isPending}
            onClick={() => void refetch()}
          >
            Muat ulang
          </Button>
        </div>
      </header>

      {complaints > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm">
            {complaints} pesanan sedang dikomplain. Pencairan dana dibekukan sampai admin
            memutuskan.
          </p>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Filter status pesanan jasa"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
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
                "relative flex min-h-[84px] flex-col items-start justify-between gap-2 bg-card p-4 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active && "bg-surface-selected hover:bg-surface-selected",
              )}
            >
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden="true" />
              ) : null}
              <span
                className={cn(
                  "text-2xl font-bold leading-none tabular-nums",
                  urgent ? "text-destructive" : "text-foreground",
                )}
              >
                {data ? <CountUp value={count} /> : "–"}
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
        <motion.section layout={!reduced} aria-label="Daftar pesanan jasa" className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((row, index) => (
              <ServiceOrderCard
                key={row.order_id}
                row={row}
                index={index}
                isExpanded={expanded === row.order_id}
                onToggle={() => setExpanded(expanded === row.order_id ? null : row.order_id)}
              />
            ))}
          </AnimatePresence>
        </motion.section>
      ) : null}
    </div>
  );
}
