import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Banknote, ChevronRight, Store } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  SearchField,
  StatStrip,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { listPayouts } from "@/lib/admin-payout.functions";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/payouts/")({
  head: () => ({
    meta: [
      { title: "Payout Seller — Admin Ebrystore" },
      {
        name: "description",
        content: "Antrean pengajuan penarikan saldo seller dan pemrosesan transfer manual.",
      },
      { property: "og:title", content: "Payout Seller — Admin Ebrystore" },
      { property: "og:description", content: "Antrean payout seller Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayouts,
});

const TABS = [
  { value: "requested", label: "Diajukan" },
  { value: "approved", label: "Disetujui" },
  { value: "transferred", label: "Ditransfer" },
  { value: "needs_reconciliation", label: "Perlu rekonsiliasi" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "all", label: "Semua" },
];

/** Langkah admin berikutnya per status, supaya antrean bisa dipindai tanpa membuka detail. */
const NEXT_STEP: Record<string, string> = {
  requested: "Tinjau pengajuan",
  approved: "Transfer ke rekening seller",
  transferred: "Konfirmasi transfer",
  needs_reconciliation: "Rekonsiliasi transfer",
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AdminPayouts() {
  const canView = useCan("payouts.view");
  const [status, setStatus] = useState("requested");
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);

  const fetchPayouts = useServerFn(listPayouts);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payouts", status, query],
    queryFn: () => fetchPayouts({ data: { status: status as any, search: query } }),
  });

  const items = useMemo<any[]>(() => (data as any)?.items ?? [], [data]);
  const totals = useMemo(
    () => ({
      net: items.reduce((s, w) => s + Number(w.net_amount), 0),
      fee: items.reduce((s, w) => s + Number(w.fee_amount), 0),
    }),
    [items],
  );

  if (!canView) return <ForbiddenState permission="payouts.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Payout Seller"
        crumb="Payout Seller"
        description="Pengajuan penarikan saldo seller. Transfer dilakukan manual dan wajib direkonsiliasi."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs label="Status payout" value={status} options={TABS} onChange={setStatus} />
        <SearchField
          id="payout-search"
          label="Cari nomor payout"
          value={search}
          onChange={setSearch}
          placeholder="WDR-…"
          className="lg:w-64"
        />
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Antrean payout tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow
          message={
            status === "requested" && !query
              ? "Tidak ada pengajuan payout baru."
              : "Tidak ada pengajuan payout pada filter ini."
          }
        />
      ) : (
        <>
          <StatStrip
            items={[
              { label: "Pengajuan", value: items.length },
              {
                label: "Total ditransfer (neto)",
                value: formatRupiah(totals.net),
                tone: "accent",
              },
              { label: "Total fee", value: formatRupiah(totals.fee) },
            ]}
          />
          <ul className="space-y-2" aria-label="Daftar payout">
            {items.map((w) => {
              const next = NEXT_STEP[w.status];
              return (
                <li key={w.id}>
                  <Link
                    to="/admin/payouts/$id"
                    params={{ id: w.id }}
                    aria-label={`Payout ${w.withdrawal_number}`}
                    className={cn(
                      "group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      w.status === "needs_reconciliation"
                        ? "border-destructive/40"
                        : next
                          ? "border-warning/50"
                          : "border-border",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
                            <Store className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{w.store_name}</p>
                            <p className="break-all font-mono text-xs text-muted-foreground">
                              {w.withdrawal_number}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold tabular-nums text-price">
                            {formatRupiah(w.net_amount)}
                          </p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            {formatRupiah(w.gross_amount)} − fee {formatRupiah(w.fee_amount)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <StatusBadge value={w.status} kind="raw" />
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Banknote className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {w.bank_name}{" "}
                            <span className="font-mono tabular-nums">{w.bank_account_masked}</span>
                            {w.bank_account_holder ? ` · ${w.bank_account_holder}` : ""}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatDateTime(w.created_at)}</span>
                      </div>

                      {next ? (
                        <p
                          className={cn(
                            "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            w.status === "needs_reconciliation"
                              ? "border-destructive/40 bg-destructive/5 text-destructive"
                              : "border-warning/50 bg-warning/10 text-warning-foreground",
                          )}
                        >
                          <ArrowRight className="size-3" aria-hidden="true" />
                          {next}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length >= 100 ? (
            <p className="text-xs text-muted-foreground">
              Menampilkan 100 payout terbaru. Persempit dengan filter atau pencarian.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
