import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { StatusPill } from "@/components/ebry/status";
import type { OrderMonitoring } from "@/lib/order-monitoring.functions";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const QUEUE_LABELS: Record<OrderMonitoring["queue"], string> = {
  delivery_blocked: "Perlu tindakan: produk belum siap diakses",
  awaiting_receipt: "Menunggu konfirmasi penerimaan pembeli",
  refund_active: "Refund sedang berjalan",
  other: "Tidak dalam antrean tindakan",
};

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

function fullDate(value: string | null) {
  if (!value) return "Belum tercatat";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Satu kartu pesanan: kepala status, baris antrean, item, ringkasan dana, rincian. */
export function SellerOrderCard({
  row,
  observedAt,
  index,
}: {
  row: OrderMonitoring;
  observedAt: string;
  index: number;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const hours = row.waiting_since
    ? Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(row.waiting_since)) / 3600000))
    : null;
  const funds = row.funds[0];
  const held = funds ? funds.held_receipt : 0;
  const released = funds ? funds.released_total : 0;
  const reserved = funds ? funds.refund_reserved : 0;

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : index * 0.04 }}
      className="min-w-0 rounded-2xl border border-border bg-card"
      aria-label={`Pesanan ${row.order_number}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
        <span className="break-all font-mono text-xs font-semibold text-foreground">
          {row.order_number}
        </span>
        <StatusPill value={row.order_status} kind="order" />
      </div>
      <p className="px-4 pt-1 text-[11px] text-muted-foreground">Dibayar {fullDate(row.paid_at)}</p>

      <div
        className={cn(
          "mx-4 my-3 rounded-xl border px-3 py-2.5 text-sm",
          row.queue === "delivery_blocked"
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-surface",
        )}
      >
        <p className="font-medium">{QUEUE_LABELS[row.queue]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.queue === "delivery_blocked"
            ? `Menunggu perbaikan sejak ${fullDate(row.waiting_since)}`
            : row.queue === "awaiting_receipt"
              ? `Menunggu ${hours ?? 0} jam sejak dibayar`
              : row.queue === "refund_active"
                ? "Pelepasan dana dibekukan selama refund"
                : row.receipt_status === "accepted"
                  ? `Dikonfirmasi pembeli ${fullDate(row.accepted_at)}`
                  : "Pesanan selesai atau tidak menunggu aksi"}
        </p>
      </div>

      <ul className="space-y-2 px-4" aria-label="Kesiapan produk">
        {row.items.map((item) => (
          <li key={item.item_id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words text-sm">{item.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  item.ready ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
                )}
              >
                {item.ready ? "Siap diakses" : "Belum siap"}
              </span>
              {!item.ready && item.product_id ? (
                <Link
                  to="/seller/produk/$id"
                  params={{ id: item.product_id }}
                  className="text-xs font-semibold text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Kelola produk
                </Link>
              ) : null}
            </span>
          </li>
        ))}
        {!row.items.length ? (
          <li className="text-sm text-muted-foreground">Tidak ada item digital.</li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-xs tabular-nums text-muted-foreground">
          Ditahan{" "}
          <span className="font-semibold text-foreground">{formatRupiah(Number(held))}</span>
          {" · "}Dilepas {formatRupiah(Number(released))}
          {reserved > 0 ? (
            <>
              {" · "}Cadangan refund {formatRupiah(Number(reserved))}
            </>
          ) : null}
        </p>
        {row.refunds.length ? (
          <div className="flex flex-wrap gap-1.5">
            {row.refunds.map((refund) => (
              <span
                key={refund.id}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {REFUND_LABELS[refund.status] ?? refund.status}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {funds ? (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-11 w-full items-center justify-between px-4 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            Rincian dana
            <ChevronDown
              className={cn(
                "size-4 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="detail"
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduced ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <dl className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  {[
                    ["Nilai item toko", funds.item_total],
                    ["Ditahan, menunggu penerimaan", funds.held_receipt],
                    ["Pendapatan dilepas (historis)", funds.released_total],
                    ["Cadangan refund aktif", funds.refund_reserved],
                    ["Debit refund seller", funds.refunded_total],
                  ].map(([label, amount]) => (
                    <div key={String(label)}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-sm tabular-nums">{formatRupiah(Number(amount))}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-xs text-muted-foreground">Release pertama</dt>
                    <dd className="text-sm">{fullDate(funds.released_at)}</dd>
                  </div>
                </dl>
                <p className="px-4 pb-4 text-[11px] text-muted-foreground">
                  Pendapatan historis bukan saldo toko saat ini. Penerimaan hanya dapat dikonfirmasi
                  pembeli; umur tunggu bukan batas otomatis pelepasan dana.
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.article>
  );
}
