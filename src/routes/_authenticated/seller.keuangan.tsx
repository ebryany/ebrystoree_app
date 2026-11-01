import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Info,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { CountUp } from "@/components/admin/report-widgets";
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

      {/* Mobile & tablet: kartu saldo ringkas, gaya sama dengan kartu saldo pembeli.
          Warna literal karena kartu ini sengaja tetap gelap di tema terang maupun gelap. */}
      <motion.section
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative isolate overflow-hidden rounded-[22px] bg-[oklch(0.16_0.012_210)] text-white shadow-[0_16px_32px_-18px_oklch(0.16_0.012_210/80%)] lg:hidden"
        aria-label="Saldo toko"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-16 -z-10 size-44 rounded-full bg-accent/55 blur-3xl"
        />
        <div className="rounded-[22px] border border-white/12 bg-gradient-to-br from-white/[0.09] via-white/[0.03] to-white/[0.06] shadow-[inset_0_1px_0_oklch(1_0_0/18%)]">
          <div className="px-4 pb-4 pt-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
              <Wallet className="size-4 shrink-0" aria-hidden="true" />
              Saldo tersedia
            </p>
            <p className="mt-1 truncate text-[28px] font-bold leading-tight tracking-tight tabular-nums">
              <CountUp value={balance} format={formatRupiah} />
            </p>
            <p className="mt-0.5 text-[11px] text-white/60">
              {balance > 0 ? "Bisa ditarik ke rekening." : "Saldo masuk setelah pesanan selesai."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href="#tarik-saldo"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-[oklch(0.16_0.012_210)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <ArrowUpRight className="size-4" aria-hidden="true" />
                Tarik saldo
              </a>
              <a
                href="#mutasi-heading"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <ReceiptText className="size-4" aria-hidden="true" />
                Mutasi
              </a>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
            {[
              { label: "Ditahan", value: data?.held ?? 0 },
              { label: "Cadangan refund", value: data?.reserved ?? 0 },
              { label: "Total masuk", value: totalIncome },
            ].map((k) => (
              <div key={k.label} className="min-w-0 px-3 py-3">
                <dt className="truncate text-[11px] text-white/60">{k.label}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
                  {formatRupiah(k.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.section>
      {/* Penjelasan singkat posisi dana (mobile), karena kartu di atas hanya memuat angka. */}
      <details className="group rounded-2xl border border-border bg-card px-4 text-xs text-muted-foreground lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Arti setiap angka
          <ChevronDown
            className="ml-auto size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="space-y-1.5 pb-3 leading-relaxed">
          <li>
            <b className="font-semibold text-foreground">Ditahan</b>: menunggu pembeli konfirmasi
            penerimaan.
          </li>
          <li>
            <b className="font-semibold text-foreground">Cadangan refund</b>: dibekukan selama
            refund diproses.
          </li>
          <li>
            <b className="font-semibold text-foreground">Total masuk</b>: jumlah semua mutasi masuk
            ({txCount} mutasi tercatat).
          </li>
        </ul>
      </details>

      {/* Desktop: saldo utama + posisi dana lain dalam satu baris. */}
      <motion.section
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="hidden gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
        aria-label="Saldo toko"
      >
        <div className="bg-card p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wallet className="size-4 shrink-0 text-accent" aria-hidden="true" />
            Saldo tersedia
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">
            <CountUp value={balance} format={formatRupiah} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Bisa ditarik ke rekening.</p>
        </div>
        {[
          {
            icon: Clock,
            label: "Ditahan",
            value: data?.held ?? 0,
            hint: "Menunggu pembeli konfirmasi penerimaan.",
          },
          {
            icon: Info,
            label: "Cadangan refund",
            value: data?.reserved ?? 0,
            hint: "Dibekukan selama refund diproses.",
          },
          {
            icon: TrendingUp,
            label: "Total pendapatan",
            value: totalIncome,
            hint: `${txCount} mutasi tercatat.`,
          },
        ].map((k) => (
          <div key={k.label} className="bg-card p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <k.icon className="size-3.5 shrink-0" aria-hidden="true" />
              {k.label}
            </p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">
              {formatRupiah(k.value)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </motion.section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Tarik saldo di kanan (desktop), di atas mutasi (HP). */}
        <div id="tarik-saldo" className="scroll-mt-24 lg:sticky lg:top-24 lg:order-2">
          <WithdrawalPanel available={balance} onChanged={() => void refetch()} />
        </div>

        {/* Mutation list */}
        <section
          className="rounded-2xl border border-border bg-card lg:order-1"
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
    </div>
  );
}
