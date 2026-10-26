import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AdminLoading, AdminError } from "@/components/admin/admin-ui";
import { CountUp } from "@/components/admin/report-widgets";
import { SellerOrderCard } from "@/components/seller/seller-order-card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listOrderMonitoring } from "@/lib/order-monitoring.functions";

export const Route = createFileRoute("/_authenticated/seller/pesanan")({
  head: () => ({
    meta: [
      { title: "Pesanan Toko — Ebrystore" },
      { name: "description", content: "Pesanan yang masuk ke toko digital Anda." },
      { property: "og:title", content: "Pesanan Toko — Ebrystore" },
      { property: "og:description", content: "Pantau pesanan yang masuk ke toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerOrders,
});

const PAGE_SIZE = 15;

const TABS = [
  {
    key: "actions",
    label: "Perlu tindakan",
    countKey: "delivery_blocked" as const,
    hint: "Produk yang belum siap diakses pembeli.",
  },
  {
    key: "awaiting_receipt",
    label: "Menunggu penerimaan",
    countKey: "awaiting_receipt" as const,
    hint: "Dana ditahan sampai pembeli mengonfirmasi penerimaan.",
  },
  {
    key: "refund_active",
    label: "Refund aktif",
    countKey: "refund_active" as const,
    hint: "Pelepasan dana dibekukan selama refund berjalan.",
  },
  { key: "all", label: "Semua", countKey: null, hint: "Semua pesanan digital toko Anda." },
] as const;

const EMPTY_HINT: Record<string, string> = {
  actions: "Semua produk sudah siap diakses. Tidak ada yang perlu ditindak sekarang.",
  awaiting_receipt: "Tidak ada pesanan yang menunggu konfirmasi pembeli.",
  refund_active: "Tidak ada refund berjalan. Dana tidak dibekukan.",
  all: "Belum ada pesanan digital. Pesanan akan muncul di sini setelah ada pembelian.",
};

function SellerOrders() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("actions");
  const [page, setPage] = useState(1);
  const { user } = useSession();
  const reduced = useReducedMotion();
  const fetchList = useServerFn(listOrderMonitoring);

  const query = useQuery({
    queryKey: ["seller-monitoring", tab, page],
    queryFn: () => fetchList({ data: { scope: "seller", filter: tab, page } }),
    refetchOnWindowFocus: "always",
  });
  // Pemicu notifikasi milik sendiri; seller tidak menerima event orders via RLS.
  useRealtimeRefresh({
    channel: "seller-orders",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["seller-monitoring"], ["seller-summary"], ["inquiry-unread"]],
    enabled: Boolean(user),
  });

  const data = query.isError ? undefined : query.data;
  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function switchTab(next: (typeof TABS)[number]["key"]) {
    setTab(next);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Pesanan toko</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Urutkan kerja dari tab Perlu tindakan; status dana ada di setiap kartu.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Muat ulang
        </Button>
      </header>

      <div
        role="tablist"
        aria-label="Filter status pesanan"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        {TABS.map((entry) => {
          const active = tab === entry.key;
          // Tab "Semua" tidak punya countKey; tanpa penjagaan ini, indeks null
          // akan dipakai ke objek counts dan menghasilkan undefined yang membingungkan.
          const count = entry.countKey ? data?.counts?.[entry.countKey] : undefined;
          return (
            <button
              key={entry.key}
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(entry.key)}
              className="relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-selected:border-transparent"
            >
              {active ? (
                <motion.span
                  layoutId="seller-pesanan-tab"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
              <span className={active ? "relative text-primary-foreground" : "relative"}>
                {entry.label}
              </span>
              <span
                className={
                  active
                    ? "relative text-primary-foreground tabular-nums"
                    : "relative tabular-nums text-muted-foreground"
                }
              >
                {typeof count === "number" ? <CountUp value={count} /> : "0"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{TABS.find((t) => t.key === tab)?.hint}</p>

      {query.isPending ? (
        <div className="space-y-3" role="status" aria-label="Memuat pesanan">
          <span className="sr-only">Memuat pesanan…</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-border bg-card p-4 motion-reduce:animate-none"
            >
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="mt-3 h-3 w-64 rounded bg-muted" />
              <div className="mt-3 h-3 w-48 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <AdminError message={query.error.message} />
      ) : data && items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm font-medium">{EMPTY_HINT[tab]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Gunakan tab Semua untuk melihat riwayat pesanan.
          </p>
        </div>
      ) : data ? (
        <>
          <motion.section layout={!reduced} aria-label="Daftar pesanan" className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((row, index) => (
                <SellerOrderCard
                  key={row.order_id}
                  row={row}
                  observedAt={data.observed_at}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </motion.section>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {data.total} pesanan · Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page >= totalPages || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </footer>
        </>
      ) : (
        <AdminLoading label="Memuat pesanan…" />
      )}
    </div>
  );
}
