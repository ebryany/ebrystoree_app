import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { BankListRow, InlineEmpty } from "@/components/ebry/cards";
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
  const fetchLedger = useServerFn(listSellerLedger);
  const { data, isPending, error } = useQuery({
    queryKey: ["seller-ledger"],
    queryFn: () => fetchLedger({}),
  });

  const balance = data?.balance ?? 0;
  const items: any[] = data?.items ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5" aria-label="Saldo toko">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Saldo pendapatan
          </p>
        </div>
        <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">
          {formatRupiah(balance)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Saldo dihitung dari buku besar pendapatan. Penarikan dana belum tersedia pada tahap ini.
        </p>
      </section>

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

        {isPending ? (
          <AdminLoading label="Memuat mutasi…" />
        ) : error || data?.error ? (
          <AdminError message={data?.error ?? undefined} />
        ) : items.length === 0 ? (
          <InlineEmpty icon={Wallet} text="Belum ada mutasi saldo." />
        ) : (
          <ul className="px-4">
            {items.map((e: any) => {
              const credit = e.direction === "credit";
              return (
                <BankListRow
                  key={e.id}
                  icon={credit ? ArrowDownLeft : ArrowUpRight}
                  title={`${SOURCE_LABEL[e.source_type] ?? e.source_type}${e.note ? ` — ${e.note}` : ""}`}
                  subtitle={shortDateTime(e.created_at)}
                  value={`${credit ? "+" : "−"}${formatRupiah(Number(e.amount))}`}
                  valueTone={credit ? "positive" : "warning"}
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
