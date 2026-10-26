import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Info, ReceiptText, TrendingUp, Wallet } from "lucide-react";

import { CountUp } from "@/components/admin/report-widgets";
import { BankListRow, InlineEmpty, StatTile } from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import { listSellerLedger } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller/keuangan")({
  head: () => ({
    meta: [
      { title: "Saldo & Pendapatan — Ebrystore" },
      { name: "description", content: "Saldo dan riwayat pendapatan toko digital Anda." },
      { property: "og:title", content: "Saldo & Pendapatan — Ebrystore" },
      { property: "og:description", content: "Lihat saldo dan riwayat pendapatan toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerFinance,
});

const SOURCE_LABEL: Record<string, string> = {
  sale: "Penjualan",
  refund: "Refund",
  adjustment: "Penyesuaian",
  reversal: "Koreksi",
  payout: "Penarikan",
};

function shortDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function SellerFinance() {
  const { user } = useSession();
  const reduced = useReducedMotion();
  const fetchLedger = useServerFn(listSellerLedger);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["seller-ledger"],
    queryFn: () => fetchLedger({}),
    refetchOnWindowFocus: "always",
  });
  useRealtimeRefresh({
    channel: "seller-keuangan",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["seller-ledger"]],
    enabled: Boolean(user),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-bold sm:text-xl">Saldo & Pendapatan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Memuat saldo toko…</p>
        </header>
        <div className="h-36 animate-pulse rounded-2xl border border-border bg-muted/60" />
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-bold sm:text-xl">Saldo & Pendapatan</h1>
        </header>
        <ErrorState
          title="Saldo toko gagal dimuat"
          description={data?.error ?? "Periksa koneksi lalu coba lagi."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const balance = data?.balance ?? 0;
  const items: any[] = data?.items ?? [];

  const totalIncome = items
    .filter((e: any) => e.direction === "credit")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const txCount = items.length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Saldo & Pendapatan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ringkasan keuangan toko digital Anda.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={isPending}
          onClick={() => void refetch()}
        >
          Muat ulang
        </Button>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          icon={TrendingUp}
          label="Total pendapatan"
          value={formatRupiah(totalIncome)}
          tone="success"
        />
        <StatTile icon={ReceiptText} label="Transaksi" value={txCount} tone="accent" />
        <StatTile
          icon={Wallet}
          label="Saldo tersedia"
          value={formatRupiah(balance)}
          tone="accent"
        />
      </div>

      {/* Balance card */}
      <motion.section
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="Saldo toko"
      >
        <div className="flex items-center gap-2">
          <Wallet className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Saldo tersedia
          </p>
        </div>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">
          <CountUp value={balance} format={formatRupiah} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pendapatan dilepas setelah pembeli menerima produk. Penarikan dana belum tersedia.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Ditahan, menunggu penerimaan
              <span title="Dana dari pesanan yang sudah dibayar tapi pembeli belum konfirmasi penerimaan.">
                <Info className="size-3 text-muted-foreground/60" aria-hidden="true" />
              </span>
            </dt>
            <dd className="font-semibold tabular-nums">{formatRupiah(data?.held ?? 0)}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Cadangan refund aktif
              <span title="Dana yang dibekukan karena ada refund yang sedang diproses.">
                <Info className="size-3 text-muted-foreground/60" aria-hidden="true" />
              </span>
            </dt>
            <dd className="font-semibold tabular-nums">{formatRupiah(data?.reserved ?? 0)}</dd>
          </div>
        </dl>
      </motion.section>

      {/* Mutation list */}
      <section
        className="rounded-2xl border border-border bg-card"
        aria-labelledby="mutasi-heading"
      >
        <h2
          id="mutasi-heading"
          className="border-b border-border px-4 py-3 text-sm font-bold text-foreground"
        >
          Riwayat mutasi
        </h2>

        {items.length === 0 ? (
          <InlineEmpty icon={Wallet} text="Belum ada mutasi saldo." />
        ) : (
          <motion.ul layout={!reduced} className="px-4" aria-label="Daftar mutasi">
            <AnimatePresence initial={false}>
              {items.map((e: any, index: number) => {
                const credit = e.direction === "credit";
                return (
                  <motion.div
                    key={e.id}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.15,
                      delay: reduced ? 0 : index * 0.02,
                    }}
                  >
                    <BankListRow
                      icon={credit ? ArrowDownLeft : ArrowUpRight}
                      title={`${SOURCE_LABEL[e.source_type] ?? e.source_type}${e.note ? ` — ${e.note}` : ""}`}
                      subtitle={shortDateTime(e.created_at)}
                      value={`${credit ? "+" : "−"}${formatRupiah(Number(e.amount))}`}
                      valueTone={credit ? "positive" : "warning"}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </section>
    </div>
  );
}
