import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Info, Wallet } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { BankListRow, InlineEmpty, PageHeader } from "@/components/ebry/cards";
import { TopupPanel } from "@/components/ebry/topup-panel";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import { getMyCredit } from "@/lib/orders.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/saldo")({
  head: () => ({
    meta: [
      { title: "Saldo Ebrystore — Ebrystore" },
      {
        name: "description",
        content: "Saldo Ebrystore Anda dari refund dan riwayat penggunaannya.",
      },
      { property: "og:title", content: "Saldo Ebrystore" },
      { property: "og:description", content: "Lihat saldo dan riwayat mutasi saldo Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SaldoSaya,
});

const SOURCE_LABEL: Record<string, string> = {
  refund: "Refund",
  adjustment: "Penyesuaian",
  reversal: "Koreksi",
  topup: "Isi saldo",
};

function SaldoSaya() {
  const fetchCredit = useServerFn(getMyCredit);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-credit"],
    queryFn: () => fetchCredit({}),
  });
  const [showTopup, setShowTopup] = useState(false);

  const { user } = useSession();
  // Filter per user: event saldo pengguna lain tidak perlu dikirim ke klien ini.
  useRealtimeRefresh({
    channel: "my-credit",
    tables: ["credit_ledger", "credit_topups"],
    filter: user ? `user_id=eq.${user.id}` : undefined,
    enabled: Boolean(user),
    keys: [["my-credit"]],
  });

  const balance = data?.balance ?? 0;
  const items: any[] = data?.items ?? [];

  return (
    <div className="-mt-5 space-y-4 md:mt-0">
      <PageHeader
        icon={Wallet}
        title="Saldo Ebrystore"
        description="Saldo dari refund yang bisa dipakai berbelanja"
      />

      {isPending ? (
        <AdminLoading label="Memuat saldo…" />
      ) : error || data?.error ? (
        <AdminError message={data?.error ?? "Saldo tidak dapat dimuat."} />
      ) : (
        <>
          {/* Kartu saldo: satu card, aksi di baris yang sama */}
          <section
            className="rounded-2xl border border-border bg-card p-5"
            aria-label="Saldo aktif"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Saldo aktif
            </p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">
              {formatRupiah(balance)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Saldo bisa dipakai untuk membayar pesanan di Ebrystore. Isi saldo lewat QRIS atau
              terima dari refund pesanan yang dibatalkan.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => setShowTopup((v) => !v)}
                aria-expanded={showTopup}
                aria-controls="panel-isi-saldo"
              >
                <Wallet className="mr-1.5 size-4" aria-hidden="true" />
                {showTopup ? "Tutup" : "Isi Saldo"}
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/dashboard/pesanan" search={{ filter: "all" }}>
                  Lihat pesanan
                </Link>
              </Button>
            </div>
            {showTopup ? (
              <div id="panel-isi-saldo" className="mt-4 border-t border-border pt-4">
                <TopupPanel
                  onPaid={async () => {
                    setShowTopup(false);
                    await refetch();
                  }}
                />
              </div>
            ) : null}
          </section>

          {/* Info keterbatasan — jujur ke user */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-info/30 bg-info/5 p-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Saldo belum dapat dicairkan ke rekening bank. Saldo hanya bisa dipakai untuk
              berbelanja di Ebrystore.
            </p>
          </div>

          {/* Riwayat mutasi */}
          <section aria-labelledby="riwayat-heading" className="rounded-2xl bg-card">
            <div className="px-4 pt-3.5">
              <h2 id="riwayat-heading" className="text-sm font-bold text-foreground">
                Riwayat saldo
              </h2>
            </div>
            {items.length === 0 ? (
              <InlineEmpty icon={Wallet} text="Belum ada mutasi saldo." />
            ) : (
              <ul className="px-4 pb-1">
                {items.map((e: any) => {
                  const isCredit = e.direction === "credit";
                  return (
                    <BankListRow
                      key={e.id}
                      icon={isCredit ? ArrowDownLeft : ArrowUpRight}
                      title={`${SOURCE_LABEL[e.source_type] ?? e.source_type}${e.reference ? ` · ${e.reference}` : ""}`}
                      subtitle={new Date(e.created_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      value={`${isCredit ? "+" : "−"}${formatRupiah(Number(e.amount))}`}
                      valueTone={isCredit ? "positive" : "default"}
                    />
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
