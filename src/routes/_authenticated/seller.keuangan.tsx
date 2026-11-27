import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Info,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  SellerFilterTabs,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { BankListRow, InlineEmpty } from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { WithdrawalPanel } from "@/components/ebry/withdrawal-panel";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import { listSellerLedger } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller/keuangan")({
  head: () => ({
    meta: [
      { title: "Saldo & Pendapatan | Ebrystore" },
      { name: "description", content: "Saldo dan riwayat pendapatan toko digital Anda." },
      { property: "og:title", content: "Saldo & Pendapatan | Ebrystore" },
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

type LedgerFilter = "all" | "credit" | "debit";

function shortDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function SellerFinance() {
  const { user } = useSession();
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const fetchLedger = useServerFn(listSellerLedger);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["seller-ledger"],
    queryFn: () => fetchLedger({}),
  });
  useRealtimeRefresh({
    channel: "seller-keuangan",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["seller-ledger"], ["withdrawal-policy"], ["my-withdrawals"]],
    enabled: Boolean(user),
  });
  // Mutasi ledger dan status payout langsung dari tabelnya; RLS membatasi ke toko sendiri.
  useRealtimeRefresh({
    channel: "seller-keuangan-ledger",
    tables: ["seller_ledger", "withdrawals"],
    keys: [["seller-ledger"], ["withdrawal-policy"], ["my-withdrawals"]],
    enabled: Boolean(user),
  });

  const items: any[] = useMemo(() => data?.items ?? [], [data?.items]);
  const creditItems = useMemo(() => items.filter((e: any) => e.direction === "credit"), [items]);
  const debitItems = useMemo(() => items.filter((e: any) => e.direction !== "credit"), [items]);
  const totalIncome = useMemo(
    () => creditItems.reduce((sum: number, e: any) => sum + Number(e.amount), 0),
    [creditItems],
  );
  const visibleItems = useMemo(() => {
    if (filter === "credit") return creditItems;
    if (filter === "debit") return debitItems;
    return items;
  }, [filter, items, creditItems, debitItems]);

  if (isPending) {
    return (
      <div className="space-y-5">
        <SellerPageHeader
          title="Saldo & Penarikan"
          description="Memuat posisi saldo dan riwayat mutasi toko..."
        />
        <div className="h-44 animate-pulse rounded-[var(--radius-panel)] border border-border bg-muted/60 motion-reduce:animate-none" />
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="space-y-5">
        <SellerPageHeader title="Saldo & Penarikan" />
        <ErrorState
          title="Saldo toko gagal dimuat"
          description={data?.error ?? "Periksa koneksi lalu coba lagi."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const balance = data?.balance ?? 0;
  const held = data?.held ?? 0;
  const reserved = data?.reserved ?? 0;

  return (
    <div className="space-y-5">
      <SellerPageHeader
        title="Saldo & Penarikan"
        description="Kelola dana penjualan yang sudah dilepas, pantau dana tertahan, dan ajukan pencairan ke rekening."
        actions={
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
        }
      />

      {/* Satu ringkasan posisi dana terpadu (responsif mobile -> desktop tanpa duplikasi DOM). */}
      <section
        aria-label="Ringkasan posisi dana toko"
        className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card shadow-[var(--elev-1)]"
      >
        <div className="bg-hero-gradient px-4 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                <Wallet className="size-4 shrink-0" aria-hidden="true" />
                Saldo tersedia untuk ditarik
              </p>
              <p className="mt-1.5 truncate font-display text-[clamp(1.75rem,1.4rem+1.2vw,2.25rem)] font-bold leading-tight tracking-tight tabular-nums">
                {formatRupiah(balance)}
              </p>
              <p className="mt-1 text-xs text-white/75">
                {balance > 0
                  ? "Dana sudah dilepas dan siap diajukan ke rekening terdaftar."
                  : "Saldo akan bertambah otomatis setelah pembeli mengonfirmasi penerimaan pesanan."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <a
                href="#tarik-saldo"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-white px-4 text-sm font-semibold text-slate-900 transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowUpRight className="size-4" aria-hidden="true" />
                Tarik saldo
              </a>
              <a
                href="#mutasi-heading"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ReceiptText className="size-4" aria-hidden="true" />
                Mutasi
              </a>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          {[
            {
              icon: Clock,
              label: "Dana ditahan",
              value: held,
              hint: "Menunggu konfirmasi penerimaan pembeli.",
              spanClass: "",
            },
            {
              icon: Info,
              label: "Cadangan refund",
              value: reserved,
              hint: "Dibekukan selama proses refund aktif.",
              spanClass: "",
            },
            {
              icon: TrendingUp,
              label: "Total mutasi masuk",
              value: totalIncome,
              hint: `${items.length.toLocaleString("id-ID")} catatan ledger tersimpan.`,
              spanClass: "col-span-2 sm:col-span-1",
            },
          ].map((k) => (
            <div key={k.label} className={`min-w-0 bg-card px-3.5 py-3 sm:px-5 sm:py-4 ${k.spanClass}`}>
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:text-xs">
                <k.icon className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate">{k.label}</span>
              </dt>
              <dd className="mt-1 break-words text-base font-bold tabular-nums text-foreground sm:text-lg">
                {formatRupiah(k.value)}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{k.hint}</p>
            </div>
          ))}
        </dl>

        <details className="group border-t border-border bg-surface/50 px-4 text-xs text-muted-foreground sm:px-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>Bagaimana alur pelepasan dana bekerja?</span>
            <ChevronDown
              className="ml-auto size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <p className="pb-3.5 leading-relaxed">
            Pembayaran pembeli terlebih dahulu masuk ke status <strong>Dana ditahan</strong> sampai
            pembeli mengonfirmasi penerimaan. Jika ada pengajuan refund, nominal terkait berpindah
            ke <strong>Cadangan refund</strong> sampai keputusan selesai. Hanya saldo yang sudah
            dilepas yang dapat ditarik ke rekening bank Anda.
          </p>
        </details>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Panel tarik saldo: tampil dulu di mobile, sticky di kanan pada desktop. */}
        <div id="tarik-saldo" className="scroll-mt-24 lg:sticky lg:top-24 lg:order-2">
          <WithdrawalPanel available={balance} onChanged={() => void refetch()} />
        </div>

        <SellerSectionCard
          title="Riwayat mutasi"
          description="Seluruh catatan masuk dan keluar pada buku besar toko Anda."
          headingId="mutasi-heading"
          className="lg:order-1"
          bodyClassName="p-0"
        >
          <div className="border-b border-border px-3 py-2 sm:px-4">
            <SellerFilterTabs<LedgerFilter>
              ariaLabel="Filter jenis mutasi"
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all", label: "Semua", count: items.length },
                { key: "credit", label: "Masuk", count: creditItems.length },
                { key: "debit", label: "Keluar", count: debitItems.length },
              ]}
            />
          </div>

          {visibleItems.length === 0 ? (
            <div className="p-4">
              <InlineEmpty
                icon={Wallet}
                text={
                  items.length === 0
                    ? "Belum ada mutasi saldo."
                    : "Tidak ada mutasi pada kategori filter ini."
                }
              />
            </div>
          ) : (
            <ul className="px-4 sm:px-5" aria-label="Daftar mutasi">
              {visibleItems.map((e: any, index: number) => {
                const credit = e.direction === "credit";
                const baseLabel = SOURCE_LABEL[e.source_type] ?? e.source_type;
                return (
                  <BankListRow
                    key={e.id}
                    className={index >= 6 ? "cv-row" : undefined}
                    icon={credit ? ArrowDownLeft : ArrowUpRight}
                    title={e.note ? `${baseLabel}: ${e.note}` : baseLabel}
                    subtitle={shortDateTime(e.created_at)}
                    value={`${credit ? "+" : "-"}${formatRupiah(Number(e.amount))}`}
                    valueTone={credit ? "positive" : "warning"}
                  />
                );
              })}
            </ul>
          )}
        </SellerSectionCard>
      </div>
    </div>
  );
}
