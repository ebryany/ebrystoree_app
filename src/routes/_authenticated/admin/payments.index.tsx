import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Banknote, ChevronRight, CreditCard, QrCode, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  SearchField,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { StoreChip, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPayments } from "@/lib/admin-transaction.functions";
import { ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/payments/")({
  head: () => ({
    meta: [
      { title: "Pembayaran — Admin Ebrystore" },
      {
        name: "description",
        content: "Verifikasi pembayaran manual dan pantau status transaksi Ebrystore.",
      },
      { property: "og:title", content: "Pembayaran — Admin Ebrystore" },
      { property: "og:description", content: "Antrean verifikasi pembayaran Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayments,
});

const PAGE_SIZE = 15;

/** Status yang paling sering dipakai tampil sebagai tab; sisanya lewat "Semua". */
const TAB_STATUSES = ["waiting_verification", "pending", "paid", "rejected", "expired"];

const METHOD: Record<string, { label: string; icon: LucideIcon }> = {
  manual_transfer: { label: "Transfer manual", icon: Banknote },
  qris: { label: "QRIS", icon: QrCode },
  shopeepay: { label: "ShopeePay", icon: Wallet },
  credit: { label: "Saldo", icon: Wallet },
};

function AdminPayments() {
  const canView = useCan("payments.view");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("waiting_verification");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchPayments = useServerFn(listPayments);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payments", search, status, page],
    queryFn: () => fetchPayments({ data: { search, status, page } }),
  });

  useRealtimeRefresh({
    channel: "admin-payments",
    tables: ["payments", "manual_payment_proofs", "payment_verifications"],
    keys: [["admin-payments"]],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="payments.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const all: any[] = (data as any)?.items ?? [];
  const items = method === "all" ? all : all.filter((p) => p.method === method);
  const total: number = (data as any)?.total ?? 0;
  const now = Date.now();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Pembayaran"
        crumb="Pembayaran"
        description="Antrean verifikasi dan riwayat pembayaran. Diperbarui otomatis."
      />

      <StatusTabs
        label="Status pembayaran"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          ...TAB_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] ?? s })),
          { value: "all", label: "Semua" },
        ]}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
        <SearchField
          id="pay-search"
          label="Cari nomor pembayaran"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="PAY-…"
        />
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger aria-label="Filter metode" className="min-h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua metode</SelectItem>
            <SelectItem value="manual_transfer">Transfer manual</SelectItem>
            <SelectItem value="qris">QRIS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data pembayaran tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow
          message={
            status === "waiting_verification" && !search && method === "all"
              ? "Tidak ada pembayaran yang menunggu verifikasi."
              : "Tidak ada pembayaran pada filter ini."
          }
        />
      ) : (
        <>
          <p className="text-sm tabular-nums text-muted-foreground">
            {total} pembayaran
            {method !== "all"
              ? ` · ${items.length} ${METHOD[method]?.label ?? method} di halaman ini`
              : ""}
          </p>
          <ul className="space-y-2" aria-label="Daftar pembayaran">
            {items.map((p) => {
              const m = METHOD[p.method] ?? { label: p.method, icon: CreditCard };
              const needsReview = p.status === "waiting_verification";
              const expiringSoon =
                p.status === "pending" &&
                p.expired_at &&
                new Date(p.expired_at).getTime() - now < 60 * 60 * 1000 &&
                new Date(p.expired_at).getTime() > now;
              return (
                <li key={p.id}>
                  <Link
                    to="/admin/payments/$id"
                    params={{ id: p.id }}
                    aria-label={`Pembayaran ${p.payment_number}`}
                    className={cn(
                      "group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      needsReview ? "border-warning/50" : "border-border",
                    )}
                  >
                    <span className="hidden size-10 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent min-[400px]:grid">
                      <m.icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs font-semibold">
                            {p.payment_number}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {m.label} · Order{" "}
                            <span className="font-mono text-xs text-foreground">
                              {p.orders?.order_number ?? "-"}
                            </span>
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-bold tabular-nums text-price">
                          {formatRupiah(Number(p.expected_amount))}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <StatusBadge value={p.status} kind="payment" />
                        <StoreChip name={p.storeName} />
                        {p.orders?.order_type ? (
                          <span>
                            {ORDER_TYPE_LABEL[p.orders.order_type] ?? p.orders.order_type}
                          </span>
                        ) : null}
                        {Number(p.reupload_count) > 0 ? (
                          <span className="tabular-nums">Unggah ulang {p.reupload_count}×</span>
                        ) : null}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tabular-nums",
                            expiringSoon && "font-semibold text-destructive",
                          )}
                        >
                          {expiringSoon ? (
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                          ) : null}
                          {p.status === "pending" || needsReview
                            ? `Batas ${formatDateTime(p.expired_at)}`
                            : `Dibuat ${formatDateTime(p.created_at)}`}
                        </span>
                      </div>
                      {needsReview ? (
                        <p className="mt-2 inline-flex rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                          Periksa bukti transfer
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
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
