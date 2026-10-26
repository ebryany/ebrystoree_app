import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ebry/status";
import { formatRupiah } from "@/lib/format";
import {
  getOrderMonitoring,
  listOrderMonitoring,
  type OrderMonitoring,
} from "@/lib/order-monitoring.functions";

const REFUND_LABELS: Record<string, string> = {
  requested: "Diajukan",
  under_review: "Ditinjau",
  information_requested: "Menunggu informasi",
  approved: "Disetujui",
  processing: "Diproses",
  completed: "Selesai",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const QUEUES = {
  delivery_blocked: "Pengiriman belum siap",
  awaiting_receipt: "Menunggu penerimaan",
  refund_active: "Refund aktif",
  other: "Tidak dalam antrean",
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("id-ID") : "Belum tercatat";
}

function MonitoringBody({ row, seller = false }: { row: OrderMonitoring; seller?: boolean }) {
  return (
    <div className="min-w-0 space-y-4 break-words text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Penerimaan pembeli</dt>
          <dd>
            {row.receipt_status === "accepted"
              ? `Dikonfirmasi: ${date(row.accepted_at)}`
              : row.receipt_status === "pending"
                ? "Belum dikonfirmasi"
                : "Receipt belum tercatat; bukan bukti penerimaan (termasuk pesanan legacy)"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Mulai menunggu</dt>
          <dd>{date(row.waiting_since)}</dd>
        </div>
      </dl>
      <ul className="space-y-2" aria-label="Kesiapan produk digital">
        {row.items.map((item) => (
          <li key={item.item_id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words">
              {item.name}: {item.ready ? "Siap diakses" : "Belum siap diakses"}
            </span>
            {seller && item.product_id ? (
              <Link
                to="/seller/produk/$id"
                params={{ id: item.product_id }}
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Kelola produk
              </Link>
            ) : null}
          </li>
        ))}
        {!row.items.length ? <li>Tidak ada item digital.</li> : null}
      </ul>
      {row.funds.map((fund) => (
        <section
          key={fund.store_id}
          className="rounded-lg border border-border p-3"
          aria-label={`Dana ${fund.store_name ?? "toko"}`}
        >
          <h3 className="font-semibold">{fund.store_name ?? "Toko"}</h3>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {[
              ["Nilai item toko", fund.item_total],
              ["Ditahan, menunggu penerimaan", fund.held_receipt],
              ["Pendapatan dilepas (historis)", fund.released_total],
              ["Cadangan refund aktif", fund.refund_reserved],
              ["Debit refund seller", fund.refunded_total],
            ].map(([label, amount]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{formatRupiah(Number(amount))}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground">Release pertama</dt>
              <dd>{date(fund.released_at)}</dd>
            </div>
          </dl>
        </section>
      ))}
      {!row.funds.length ? (
        <p className="text-muted-foreground">Tidak ada alokasi dana seller pada pesanan ini.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Pendapatan historis bukan saldo toko saat ini. Kesiapan akses diperiksa saat data dimuat;
        tidak membuktikan pembeli sudah mengunduh. Penerimaan hanya dapat dikonfirmasi pembeli.
      </p>
      {row.refunds.length ? (
        <ul className="space-y-2" aria-label="Status refund">
          {row.refunds.map((refund) => (
            <li key={refund.id} className="flex flex-wrap items-center gap-2">
              <span className="break-all">{refund.number}</span>
              <StatusPill
                value={refund.status}
                kind="raw"
                label={REFUND_LABELS[refund.status] ?? refund.status}
              />
              {refund.amount !== null ? (
                <span className="tabular-nums">
                  {formatRupiah(Number(refund.amount))} (total pengajuan pesanan)
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Diajukan {date(refund.created_at)}
                {refund.processed_at ? `; selesai ${date(refund.processed_at)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OrderMonitoringDetail({ id }: { id: string }) {
  const fetchDetail = useServerFn(getOrderMonitoring);
  const query = useQuery({
    queryKey: ["order-monitoring", "admin", id],
    queryFn: () => fetchDetail({ data: { scope: "admin", id } }),
    refetchOnWindowFocus: "always",
  });
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="Penerimaan dan dana seller"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Penerimaan dan dana seller</h2>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Muat ulang
        </Button>
      </div>
      {query.isPending ? (
        <p role="status">Memuat penerimaan dan dana…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <MonitoringBody row={query.data} />
      ) : (
        <p>Detail monitoring tidak tersedia.</p>
      )}
    </section>
  );
}

export function OrderMonitoringList({ scope }: { scope: "seller" | "admin" }) {
  const [filter, setFilter] = useState(
    "actions" as "all" | "actions" | "delivery_blocked" | "awaiting_receipt" | "refund_active",
  );
  const [page, setPage] = useState(1);
  const fetchList = useServerFn(listOrderMonitoring);
  const query = useQuery({
    queryKey: ["order-monitoring", scope, filter, page],
    queryFn: () => fetchList({ data: { scope, filter, page } }),
    refetchOnWindowFocus: "always",
  });
  const data = query.isError ? undefined : query.data;
  return (
    <section
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="Monitoring pesanan digital"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Monitoring pesanan digital</h2>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Muat ulang
        </Button>
      </header>
      <p className="mt-2 text-xs text-muted-foreground">
        Pengiriman bermasalah, penerimaan pembeli, dan refund. Umur tunggu bukan batas otomatis
        pelepasan dana.
      </p>
      <label className="mt-4 block text-sm">
        Tampilkan
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as typeof filter);
            setPage(1);
          }}
          className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 sm:max-w-xs"
        >
          <option value="actions">Dalam antrean</option>
          <option value="delivery_blocked">Pengiriman belum siap</option>
          <option value="awaiting_receipt">Menunggu penerimaan</option>
          <option value="refund_active">Refund aktif</option>
          <option value="all">Semua pesanan digital</option>
        </select>
      </label>
      {query.isPending ? (
        <p className="mt-4" role="status">
          Memuat monitoring pesanan…
        </p>
      ) : query.isError ? (
        <p className="mt-4 text-sm" role="alert">
          {query.error.message}
        </p>
      ) : data ? (
        <>
          <p className="my-4 text-xs text-muted-foreground">
            Pengiriman belum siap: {data.counts.delivery_blocked ?? 0}. Menunggu penerimaan:{" "}
            {data.counts.awaiting_receipt ?? 0}. Refund aktif: {data.counts.refund_active ?? 0}.
          </p>
          {!data.items.length ? (
            <p className="text-sm">
              Tidak ada pesanan pada filter ini. Gunakan Semua pesanan digital untuk melihat
              riwayat.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((row) => {
                const hours = row.waiting_since
                  ? Math.max(
                      0,
                      Math.floor(
                        (Date.parse(data.observed_at) - Date.parse(row.waiting_since)) / 3600000,
                      ),
                    )
                  : null;
                return (
                  <li key={row.order_id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-semibold">{row.order_number}</span>
                      <StatusPill value={row.order_status} kind="order" />
                    </div>
                    <p className="mt-1 text-sm">
                      {QUEUES[row.queue]}
                      {hours !== null ? ` (${hours} jam)` : ""}
                    </p>
                    {scope === "admin" ? (
                      <Link
                        to="/admin/orders/$id"
                        params={{ id: row.order_id }}
                        className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Detail pesanan
                      </Link>
                    ) : (
                      <details className="mt-3">
                        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2">
                          Lihat produk, penerimaan, dan dana
                        </summary>
                        <div className="pt-3">
                          <MonitoringBody row={row} seller />
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {data.total} pesanan. Halaman {page} dari {Math.max(1, Math.ceil(data.total / 15))}.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page * 15 >= data.total || query.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </section>
  );
}
